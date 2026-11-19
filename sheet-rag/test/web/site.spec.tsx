import { describe, it, expect, vi } from "vitest";
import site from "../../src/site";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { CSP } from "../../src/web/middleware/security";

// Entry-level tests for the hotel-dictionary Worker (TASK-42): the real
// src/site.ts, a fake D1 with the real migrations (schema and settings seed),
// and a fake ASSETS fetcher. No Cloudflare credentials are needed.

const SECURITY_HEADERS: Record<string, string> = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"Content-Security-Policy": CSP,
	"X-Frame-Options": "DENY",
};

function expectSecurityHeaders(res: Response) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		expect(res.headers.get(name), name).toBe(value);
	}
	expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
}

async function makeEnv(): Promise<{
	db: FakeD1;
	env: { DB: D1Database; ASSETS: Fetcher };
	assets: ReturnType<typeof vi.fn>;
}> {
	const db = createFakeD1();
	await applyMigrations(db);
	const assets = vi.fn(async (req: Request) => {
		return new Response(`asset:${new URL(req.url).pathname}`, {
			headers: { "Content-Type": "text/plain" },
		});
	});
	const env = {
		DB: db as unknown as D1Database,
		ASSETS: { fetch: assets } as unknown as Fetcher,
	};
	return { db, env, assets };
}

const ctx = {
	waitUntil: vi.fn(),
	passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;

function get(env: unknown, path: string, headers: Record<string, string> = {}) {
	return site.fetch(
		new Request(`https://example.test${path}`, {
			headers: { "CF-Connecting-IP": "1.2.3.4", ...headers },
		}),
		env as never,
		ctx,
	);
}

describe("site: pages", () => {
	it("site: GET /bill is Vietnamese with security headers and noindex", async () => {
		const { env, db } = await makeEnv();
		const seeded = await db
			.prepare("SELECT value FROM settings WHERE key = 'disclaimer_vi'")
			.first<{ value: string }>();
		expect(seeded?.value).toBeTruthy();

		const res = await get(env, "/bill");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("text/html");
		expectSecurityHeaders(res);
		const html = await res.text();
		expect(html).toContain('lang="vi"');
		expect(html).toContain(seeded!.value);
	});

	it("site: GET /en/bill is English with security headers and noindex", async () => {
		const { env, db } = await makeEnv();
		const seeded = await db
			.prepare("SELECT value FROM settings WHERE key = 'disclaimer_en'")
			.first<{ value: string }>();

		const res = await get(env, "/en/bill");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("text/html");
		expectSecurityHeaders(res);
		const html = await res.text();
		expect(html).toContain('lang="en"');
		expect(seeded?.value).toBeTruthy();
		expect(html).toContain(seeded!.value);
	});
});

describe("site: JSON API", () => {
	it("site: /api/config returns database settings", async () => {
		const { env } = await makeEnv();
		const res = await get(env, "/api/config");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
		const body = (await res.json()) as Record<string, unknown>;
		expect(JSON.stringify(body)).toContain("10");
	});

	it("site: /api/hotels is empty on an empty database and lists a seeded hotel", async () => {
		const { env, db } = await makeEnv();

		const empty = await get(env, "/api/hotels");
		expect(empty.status).toBe(200);
		expect(empty.headers.get("Content-Type")).toContain("application/json");
		const emptyText = await empty.text();
		expect(emptyText).not.toContain("Seeded Hotel");

		await db
			.prepare("INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)")
			.bind("da-nang", "Đà Nẵng", "Da Nang")
			.run();
		await db
			.prepare(
				`INSERT INTO hotels (id, slug, city_slug, name, name_search, status,
					source_file_id, source_gid, source_hash, synced_at)
				 VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)`,
			)
			.bind(
				"h1",
				"seeded-hotel",
				"da-nang",
				"Seeded Hotel",
				"seeded hotel",
				"file-1",
				"0",
				"hash-1",
				"2026-11-19T00:00:00Z",
			)
			.run();

		const seeded = await get(env, "/api/hotels");
		expect(seeded.status).toBe(200);
		expect(await seeded.text()).toContain("Seeded Hotel");
	});

	it("site: /api/cities returns 200 JSON", async () => {
		const { env } = await makeEnv();
		const res = await get(env, "/api/cities");
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
		expect(await res.json()).toBeDefined();
	});
});

describe("site: static files", () => {
	it("site: static files go to ASSETS and /bill does not", async () => {
		const { env, assets } = await makeEnv();

		for (const path of ["/lang.js", "/app.css", "/bill.js", "/bill.css"]) {
			const res = await get(env, path);
			expect(res.status, path).toBe(200);
			expect(await res.text(), path).toBe(`asset:${path}`);
		}
		expect(assets).toHaveBeenCalledTimes(4);
		const firstCall = assets.mock.calls[0][0] as Request;
		expect(new URL(firstCall.url).pathname).toBe("/lang.js");

		assets.mockClear();
		const bill = await get(env, "/bill");
		expect(bill.status).toBe(200);
		expect(assets).not.toHaveBeenCalled();
	});
});

describe("site: 404s", () => {
	it("site: unknown paths and the absent /search and /chat routes return 404 with headers", async () => {
		const { env } = await makeEnv();

		const nope = await get(env, "/nope");
		expect(nope.status).toBe(404);
		expectSecurityHeaders(nope);

		const apiNope = await get(env, "/api/nope");
		expect(apiNope.status).toBe(404);
		expect(await apiNope.json()).toEqual({ error: "not_found" });

		for (const path of ["/search", "/chat", "/en/search", "/en/chat"]) {
			const res = await get(env, path);
			expect(res.status, path).toBe(404);
		}
	});
});

describe("site: shared app and limiter", () => {
	it("site: the app and limiter are shared per env (429 on the 61st /api/config request)", async () => {
		const { env } = await makeEnv();
		const ip = { "CF-Connecting-IP": "9.9.9.9" };

		for (let i = 0; i < 60; i++) {
			const res = await get(env, "/api/config", ip);
			expect(res.status, `request ${i + 1}`).toBe(200);
		}
		const limited = await get(env, "/api/config", ip);
		expect(limited.status).toBe(429);
		expectSecurityHeaders(limited);
	});
});
