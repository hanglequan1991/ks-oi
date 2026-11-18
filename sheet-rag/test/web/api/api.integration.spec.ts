import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/web/app";
import { mountApi } from "../../../src/web/api";
import { getSettings, type SiteSettings } from "../../../src/db/settings";
import { createFakeD1, type FakeD1 } from "../../fakes/d1";
import { applyMigrations } from "../../fakes/migrations";
import { SAMPLE_BASE_PRICE_STRINGS, seedApiSample } from "../../fixtures/apiSample";

// End-to-end check of the JSON API (STORY-15): real createApp, real mountApi,
// fake D1 with the real migrations (schema and the settings seed), the sample
// data, and the real getSettings. No Cloudflare binding is needed.

const HIDDEN_NAMES = ["mong-review", "mong-hidden", "Mộng Review", "Mộng Hidden"];
const BASE_PRICE_WORDS = ["base_price", "basePrice", "min_base_price"];
const PUBLISHED_SLUGS = ["mong-hotel", "sao-hotel", "dong-do-hotel"];
const UNPUBLISHED_SLUGS = ["mong-review", "mong-hidden"];
const READ_ENDPOINTS = ["/api/hotels", "/api/hotels/mong-hotel", "/api/cities", "/api/suggest", "/api/config"];

async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

function buildApp(db: FakeD1) {
	const d1 = db as unknown as D1Database;
	let settingsCalls = 0;
	const getSettingsCounted = async (): Promise<SiteSettings> => {
		settingsCalls++;
		return getSettings(d1, () => {});
	};
	const app = createApp({
		getSettings: getSettingsCounted,
		mount: mountApi({ db: d1, getSettings: getSettingsCounted }),
	});
	return { app, settingsCalls: () => settingsCalls };
}

interface Reply {
	path: string;
	status: number;
	headers: Headers;
	text: string;
}

async function get(app: ReturnType<typeof buildApp>["app"], path: string, headers?: Record<string, string>): Promise<Reply> {
	const res = await app.request(path, { headers });
	return { path, status: res.status, headers: res.headers, text: await res.text() };
}

/** Every public GET the sweep covers: list pages, details in both languages, cities, suggest, config. */
const SWEEP_PATHS = [
	"/api/hotels",
	"/api/hotels?lang=en",
	"/api/hotels?page=1&limit=1&lang=en",
	"/api/hotels?page=2&limit=1",
	"/api/hotels?city=da-nang&lang=en",
	"/api/hotels?sort=price&lang=en",
	...PUBLISHED_SLUGS.flatMap((slug) => [`/api/hotels/${slug}`, `/api/hotels/${slug}?lang=en`]),
	...UNPUBLISHED_SLUGS.flatMap((slug) => [`/api/hotels/${slug}`, `/api/hotels/${slug}?lang=en`]),
	"/api/cities",
	"/api/cities?lang=en",
	"/api/suggest?q=mong",
	"/api/suggest?q=sao&lang=en",
	"/api/suggest?q=dong",
	"/api/suggest?q=review",
	"/api/suggest?q=hidden",
	"/api/config",
];

async function sweep(app: ReturnType<typeof buildApp>["app"]): Promise<Reply[]> {
	const replies: Reply[] = [];
	for (const path of SWEEP_PATHS) replies.push(await get(app, path));
	return replies;
}

describe("API integration sweep (STORY-15)", () => {
	it("no endpoint response contains a base price", async () => {
		const { app } = buildApp(await sampleDb());
		const replies = await sweep(app);

		expect(replies.length).toBeGreaterThan(15);
		for (const r of replies) {
			for (const price of SAMPLE_BASE_PRICE_STRINGS) {
				expect(r.text, `${r.path} leaks ${price}`).not.toContain(price);
			}
			for (const word of BASE_PRICE_WORDS) {
				expect(r.text, `${r.path} mentions ${word}`).not.toContain(word);
			}
		}
	});

	it("non-published hotels never appear anywhere", async () => {
		const { app } = buildApp(await sampleDb());
		const replies = await sweep(app);

		for (const r of replies) {
			const isUnpublishedDetail = UNPUBLISHED_SLUGS.some((slug) => r.path.startsWith(`/api/hotels/${slug}`));
			if (isUnpublishedDetail) {
				// The 404 for their own detail URL is allowed, but must not echo the name.
				expect(r.status, r.path).toBe(404);
			}
			for (const name of HIDDEN_NAMES) {
				expect(r.text, `${r.path} mentions ${name}`).not.toContain(name);
			}
		}
	});

	it("only read endpoints exist", async () => {
		const { app } = buildApp(await sampleDb());
		const methods = ["POST", "PUT", "PATCH", "DELETE"];

		for (const path of READ_ENDPOINTS) {
			for (const method of methods) {
				const res = await app.request(path, { method, body: method === "POST" ? "{}" : undefined, headers: { "Content-Type": "application/json" } });
				expect([404, 405], `${method} ${path}`).toContain(res.status);
				expect(res.status, `${method} ${path}`).not.toBe(200);
			}
		}

		const config = await get(app, "/api/config");
		expect(config.text).not.toMatch(/phone|zalo/i);
	});

	it("fee setting changes flow from the database to the price", async () => {
		const db = await sampleDb();
		const { app } = buildApp(db);
		const deluxePrice = async () => {
			const body = JSON.parse((await get(app, "/api/hotels/mong-hotel")).text) as {
				rooms: Array<{ name: string; price: { amount: number; includesFeePercent?: number } | null }>;
			};
			return body.rooms.find((r) => r.name === "Deluxe")?.price;
		};

		// Seed default: 10 percent. Deluxe base 1250000 gives 1375000.
		expect((await deluxePrice())?.amount).toBe(1375000);

		await db.exec("UPDATE settings SET value = '20' WHERE key = 'service_fee_percent'");
		expect((await deluxePrice())?.amount).toBe(1500000);

		await db.exec("UPDATE settings SET value = 'abc' WHERE key = 'service_fee_percent'");
		expect((await deluxePrice())?.amount).toBe(1375000);

		await db.exec("UPDATE settings SET value = '150' WHERE key = 'service_fee_percent'");
		expect((await deluxePrice())?.amount).toBe(2500000);

		await db.exec("UPDATE settings SET value = '10' WHERE key = 'service_fee_percent'");
		await db.exec("UPDATE settings SET value = 'false' WHERE key = 'show_fee_note'");
		const price = await deluxePrice();
		expect(price?.amount).toBe(1375000);
		expect(price).not.toHaveProperty("includesFeePercent");
	});

	it("api responses carry noindex and security headers and are rate limited", async () => {
		const db = await sampleDb();
		const d1 = db as unknown as D1Database;
		let settingsCalls = 0;
		const getSettingsCounted = async (): Promise<SiteSettings> => {
			settingsCalls++;
			return getSettings(d1, () => {});
		};
		const app = createApp({
			getSettings: getSettingsCounted,
			mount: mountApi({ db: d1, getSettings: getSettingsCounted }),
		});

		const ip = { "CF-Connecting-IP": "203.0.113.7" };
		const ok = await get(app, "/api/hotels", ip);
		expect(ok.status).toBe(200);
		expect(ok.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		expect(ok.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(ok.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
		expect(ok.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
		expect(ok.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
		expect(ok.headers.get("X-Frame-Options")).toBe("DENY");

		const notFound = await get(app, "/api/hotels/no-such-hotel");
		expect(notFound.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		expect(notFound.headers.get("X-Frame-Options")).toBe("DENY");

		// 60 per minute per IP: the first 59 more are fine, the 61st is refused.
		for (let i = 1; i < 60; i++) {
			expect((await get(app, "/api/hotels", ip)).status).toBe(200);
		}
		const callsBefore = settingsCalls;
		const refused = await get(app, "/api/hotels", ip);
		expect(refused.status).toBe(429);
		expect(refused.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		// The refused request never reached the route, so no settings read happened.
		expect(settingsCalls).toBe(callsBefore);

		// A different IP has its own budget.
		expect((await get(app, "/api/hotels", { "CF-Connecting-IP": "203.0.113.8" })).status).toBe(200);
	});

	it("runs with no CLOUDFLARE_API_TOKEN", async () => {
		const saved = process.env.CLOUDFLARE_API_TOKEN;
		delete process.env.CLOUDFLARE_API_TOKEN;
		try {
			const { app } = buildApp(await sampleDb());
			const res = await get(app, "/api/config");
			expect(res.status).toBe(200);
			expect(JSON.parse(res.text)).toHaveProperty("serviceFeePercent", 10);
		} finally {
			if (saved !== undefined) process.env.CLOUDFLARE_API_TOKEN = saved;
		}
	});
});
