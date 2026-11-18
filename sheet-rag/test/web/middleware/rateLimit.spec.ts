import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import {
	createMemoryLimiter,
	rateLimit,
	type RateLimiter,
} from "../../../src/web/middleware/rateLimit";

function fakeClock(start = 1_000_000) {
	let t = start;
	return {
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
	};
}

function appWith(limiter: Parameters<typeof rateLimit>[0]["limiter"], opts: { keyPrefix?: string; handler?: () => void } = {}) {
	let calls = 0;
	const app = new Hono();
	app.use(
		"*",
		rateLimit({ limiter, keyPrefix: opts.keyPrefix ?? "search" }),
	);
	app.get("/", (c) => {
		calls++;
		opts.handler?.();
		return c.text("ok");
	});
	return { app, calls: () => calls };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("rateLimit middleware (TASK-12)", () => {
	it("blocks the request over the limit with 429 and Retry-After", async () => {
		const clock = fakeClock();
		const limiter = createMemoryLimiter({ limit: 3, windowMs: 60_000, now: clock.now });
		let handled = 0;
		const app = new Hono();
		app.use("*", rateLimit({ limiter, keyPrefix: "search" }));
		app.get("/", (c) => {
			handled++;
			return c.text("ok");
		});

		const headers = { "CF-Connecting-IP": "1.2.3.4" };
		for (let i = 1; i <= 3; i++) {
			const res = await app.request("/", { headers });
			expect(res.status).toBe(200);
		}
		expect(handled).toBe(3);

		const res = await app.request("/", { headers });
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("60");
		expect(res.headers.get("Content-Type")).toContain("application/json");
		expect(await res.json()).toEqual({ error: "too_many_requests" });
		expect(handled).toBe(3);
	});

	it("honours a configured retryAfterSeconds", async () => {
		const limiter = createMemoryLimiter({ limit: 1, windowMs: 60_000 });
		const app = new Hono();
		app.use("*", rateLimit({ limiter, keyPrefix: "x", retryAfterSeconds: 15 }));
		app.get("/", (c) => c.text("ok"));
		const headers = { "CF-Connecting-IP": "9.9.9.9" };
		await app.request("/", { headers });
		const res = await app.request("/", { headers });
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("15");
	});

	it("other clients and other prefixes are not affected", async () => {
		const clock = fakeClock();
		const limiter = createMemoryLimiter({ limit: 2, windowMs: 60_000, now: clock.now });

		const search = new Hono();
		search.use("*", rateLimit({ limiter, keyPrefix: "search" }));
		search.get("/", (c) => c.text("ok"));

		const chat = new Hono();
		chat.use("*", rateLimit({ limiter, keyPrefix: "chat" }));
		chat.get("/", (c) => c.text("ok"));

		const alice = { "CF-Connecting-IP": "10.0.0.1" };
		const bob = { "CF-Connecting-IP": "10.0.0.2" };

		await search.request("/", { headers: alice });
		await search.request("/", { headers: alice });
		expect((await search.request("/", { headers: alice })).status).toBe(429);

		// other IP still passes on the same prefix
		expect((await search.request("/", { headers: bob })).status).toBe(200);
		// same IP, different prefix has its own counter
		expect((await chat.request("/", { headers: alice })).status).toBe(200);
	});

	it("accepts requests again after the window ends", async () => {
		const clock = fakeClock();
		const windowMs = 60_000;
		const limiter = createMemoryLimiter({ limit: 1, windowMs, now: clock.now });
		const app = new Hono();
		app.use("*", rateLimit({ limiter, keyPrefix: "search" }));
		app.get("/", (c) => c.text("ok"));
		const headers = { "CF-Connecting-IP": "5.5.5.5" };

		expect((await app.request("/", { headers })).status).toBe(200);
		expect((await app.request("/", { headers })).status).toBe(429);

		clock.advance(windowMs - 1);
		expect((await app.request("/", { headers })).status).toBe(429);

		clock.advance(1);
		expect((await app.request("/", { headers })).status).toBe(200);
	});

	it("fails open when the limiter is missing or throws", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		// limiter resolver returns undefined
		const missing = appWith(() => undefined);
		expect((await missing.app.request("/")).status).toBe(200);
		expect(missing.calls()).toBe(1);

		// limiter resolver throws
		const resolverThrows = appWith(() => {
			throw new Error("boom");
		});
		expect((await resolverThrows.app.request("/")).status).toBe(200);
		expect(resolverThrows.calls()).toBe(1);

		// limiter.limit throws
		const broken: RateLimiter = {
			limit: async () => {
				throw new Error("outage");
			},
		};
		const limitThrows = appWith(broken);
		expect((await limitThrows.app.request("/")).status).toBe(200);
		expect(limitThrows.calls()).toBe(1);

		expect(warn).toHaveBeenCalled();
	});

	it("client key uses CF-Connecting-IP then X-Forwarded-For then unknown", async () => {
		const seen: string[] = [];
		const recorder: RateLimiter = {
			limit: async ({ key }) => {
				seen.push(key);
				return { success: true };
			},
		};
		const app = new Hono();
		app.use("*", rateLimit({ limiter: recorder, keyPrefix: "p" }));
		app.get("/", (c) => c.text("ok"));

		await app.request("/", {
			headers: { "CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "2.2.2.2, 3.3.3.3" },
		});
		await app.request("/", { headers: { "X-Forwarded-For": "2.2.2.2, 3.3.3.3" } });
		await app.request("/", { headers: { "X-Forwarded-For": " 4.4.4.4 , 5.5.5.5" } });
		await app.request("/");

		expect(seen).toEqual(["p:1.1.1.1", "p:2.2.2.2", "p:4.4.4.4", "p:unknown"]);
	});

	it("uses a custom clientKey when given", async () => {
		const seen: string[] = [];
		const recorder: RateLimiter = {
			limit: async ({ key }) => {
				seen.push(key);
				return { success: true };
			},
		};
		const app = new Hono();
		app.use(
			"*",
			rateLimit({ limiter: recorder, keyPrefix: "q", clientKey: () => "fixed" }),
		);
		app.get("/", (c) => c.text("ok"));
		await app.request("/", { headers: { "CF-Connecting-IP": "1.1.1.1" } });
		expect(seen).toEqual(["q:fixed"]);
	});

	it("memory limiter purges expired keys", async () => {
		const clock = fakeClock();
		const windowMs = 1_000;
		const limiter = createMemoryLimiter({ limit: 1, windowMs, now: clock.now });

		// fill past the 10,000 entry threshold with keys that expire
		for (let i = 0; i < 10_001; i++) {
			await limiter.limit({ key: `old:${i}` });
		}
		clock.advance(windowMs + 1);

		expect(limiter.size()).toBe(10_001);

		// a new key after the window passed triggers the purge
		await limiter.limit({ key: "fresh" });

		expect(limiter.size()).toBe(1);
		// expired keys were dropped, so they start a new window with full quota
		expect((await limiter.limit({ key: "old:0" })).success).toBe(true);
	});

	it("memory limiter keeps a key blocked within its window", async () => {
		const clock = fakeClock();
		const limiter = createMemoryLimiter({ limit: 1, windowMs: 1_000, now: clock.now });
		expect((await limiter.limit({ key: "a" })).success).toBe(true);
		expect((await limiter.limit({ key: "a" })).success).toBe(false);
	});
});
