import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createApp, type WebEnv } from "../../../src/web/app";
import {
	registerInternalSyncRoute,
	constantTimeEqual,
	type InternalSyncDeps,
} from "../../../src/web/routes/internalSync";
import { createMemoryLimiter } from "../../../src/web/middleware/rateLimit";
import type { SiteSettings } from "../../../src/db/settings";

const SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Thông báo VI",
	disclaimerEn: "En notice",
};

const TOKEN = "s3cret-token-value";
const SUMMARY = { added: 3, updated: 2, removed: 1, failures: [{ row: 7, reason: "bad price" }] };

function makeApp(over: Partial<InternalSyncDeps> = {}) {
	const runSync = over.runSync ?? vi.fn(async () => SUMMARY);
	const deps: InternalSyncDeps = {
		getToken: over.getToken ?? (() => TOKEN),
		runSync,
		limiter: over.limiter,
	};
	const app = createApp({
		getSettings: async () => SETTINGS,
		mount: (a) => registerInternalSyncRoute(a as Hono<WebEnv>, deps),
	});
	return { app, runSync };
}

function post(app: Hono<WebEnv>, path: string, headers: Record<string, string> = {}, method = "POST") {
	return app.request(path, {
		method,
		headers: { "CF-Connecting-IP": "203.0.113.9", ...headers },
	});
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("POST /internal/sync", () => {
	it("404 when token unset or empty, identical to an unknown route for every method", async () => {
		const methods = ["POST", "GET", "PUT", "PATCH", "DELETE"];
		// Full header set as sorted "name: value" lines, so any extra header shows up.
		const headerLines = (res: Response) =>
			[...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).sort();

		for (const getToken of [() => undefined, () => ""]) {
			const { app, runSync } = makeApp({ getToken });
			for (const method of methods) {
				const unknown = await app.request("/internal/nope", {
					method,
					headers: { "CF-Connecting-IP": "203.0.113.9", ...auth("") },
				});
				const res = await app.request("/internal/sync", {
					method,
					headers: { "CF-Connecting-IP": "203.0.113.9", ...auth("") },
				});
				expect(res.status, method).toBe(404);
				expect(res.status, method).toBe(unknown.status);
				expect(await res.text(), method).toBe(await unknown.text());
				expect(headerLines(res), method).toEqual(headerLines(unknown));
				expect(res.headers.get("Cache-Control"), method).toBeNull();
				expect(res.headers.get("X-Robots-Tag"), method).toContain("noindex");
			}
			expect(runSync).not.toHaveBeenCalled();
		}
	});

	it("401 for missing, wrong, and query-string token", async () => {
		const { app, runSync } = makeApp();
		const missing = await post(app, "/internal/sync");
		expect(missing.status).toBe(401);
		const wrong = await post(app, "/internal/sync", auth("nope"));
		expect(wrong.status).toBe(401);
		const malformed = await post(app, "/internal/sync", { Authorization: TOKEN });
		expect(malformed.status).toBe(401);
		const inQuery = await post(app, `/internal/sync?token=${TOKEN}`);
		expect(inQuery.status).toBe(401);
		const inQueryAndWrongHeader = await post(app, `/internal/sync?token=${TOKEN}`, auth("nope"));
		expect(inQueryAndWrongHeader.status).toBe(401);

		for (const res of [missing, wrong, malformed, inQuery]) {
			expect(res.headers.get("WWW-Authenticate")).toBeNull();
			expect(await res.text()).not.toContain(TOKEN);
		}
		expect(runSync).not.toHaveBeenCalled();
	});

	it("constant-time compare function handles different lengths and equal tokens", async () => {
		expect(await constantTimeEqual(TOKEN, TOKEN)).toBe(true);
		expect(await constantTimeEqual(TOKEN, TOKEN + "x")).toBe(false);
		expect(await constantTimeEqual(TOKEN + "x", TOKEN)).toBe(false);
		expect(await constantTimeEqual("", TOKEN)).toBe(false);
		expect(await constantTimeEqual(TOKEN, "abc")).toBe(false);
		expect(await constantTimeEqual("abc", "abd")).toBe(false);
		expect(await constantTimeEqual("", "")).toBe(true);
	});

	it("200 with summary and force flag", async () => {
		const { app, runSync } = makeApp();

		const plain = await post(app, "/internal/sync", auth(TOKEN));
		expect(plain.status).toBe(200);
		expect(plain.headers.get("Content-Type")).toContain("application/json");
		expect(await plain.json()).toEqual(SUMMARY);
		expect(runSync).toHaveBeenLastCalledWith({ force: false });

		const forced = await post(app, "/internal/sync?force=1", auth(TOKEN));
		expect(forced.status).toBe(200);
		expect(runSync).toHaveBeenLastCalledWith({ force: true });
	});

	it("429 after limit even with wrong token", async () => {
		const limiter = createMemoryLimiter({ limit: 5, windowMs: 60_000 });
		const { app, runSync } = makeApp({ limiter });

		for (let i = 0; i < 5; i++) {
			const res = await post(app, "/internal/sync", auth("wrong"));
			expect(res.status).toBe(401);
		}
		const limited = await post(app, "/internal/sync", auth("wrong"));
		expect(limited.status).toBe(429);
		// Limit is checked before the token, so the correct token is refused too.
		const correctAfterLimit = await post(app, "/internal/sync", auth(TOKEN));
		expect(correctAfterLimit.status).toBe(429);
		expect(runSync).not.toHaveBeenCalled();
	});

	it("500 generic when sync throws", async () => {
		const runSync = vi.fn(async () => {
			throw new Error("db password is hunter2");
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { app } = makeApp({ runSync });
		const res = await post(app, "/internal/sync", auth(TOKEN));
		expect(res.status).toBe(500);
		const body = await res.text();
		expect(body).not.toContain("hunter2");
		expect(body).not.toContain("db password");
		vi.restoreAllMocks();
	});

	it("noindex and no-store headers on 200, 401, 429", async () => {
		const limiter = createMemoryLimiter({ limit: 1, windowMs: 60_000 });
		const { app } = makeApp({ limiter });

		const unauthorized = await post(app, "/internal/sync", auth("wrong"));
		expect(unauthorized.status).toBe(401);
		expect(unauthorized.headers.get("X-Robots-Tag")).toContain("noindex");
		expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");

		const limited = await post(app, "/internal/sync", auth("wrong"));
		expect(limited.status).toBe(429);
		expect(limited.headers.get("X-Robots-Tag")).toContain("noindex");
		expect(limited.headers.get("Cache-Control")).toBe("no-store");

		const { app: okApp } = makeApp();
		const ok = await post(okApp, "/internal/sync", auth(TOKEN));
		expect(ok.status).toBe(200);
		expect(ok.headers.get("X-Robots-Tag")).toContain("noindex");
		expect(ok.headers.get("Cache-Control")).toBe("no-store");
	});

	it("GET returns 404", async () => {
		const { app, runSync } = makeApp();
		const res = await app.request("/internal/sync", {
			method: "GET",
			headers: { ...auth(TOKEN), "CF-Connecting-IP": "203.0.113.9" },
		});
		expect(res.status).toBe(404);
		expect(runSync).not.toHaveBeenCalled();
	});
});
