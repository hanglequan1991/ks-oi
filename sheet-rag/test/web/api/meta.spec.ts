import { describe, it, expect } from "vitest";
import { createApp } from "../../../src/web/app";
import { registerMetaRoutes } from "../../../src/web/api/meta";
import type { ApiDeps } from "../../../src/web/api/types";
import { getSettings, type SiteSettings } from "../../../src/db/settings";
import { createFakeD1, type FakeD1 } from "../../fakes/d1";
import { applyMigrations } from "../../fakes/migrations";
import {
	SAMPLE_BASE_PRICE_STRINGS,
	seedApiSample,
	seedManyPublished,
} from "../../fixtures/apiSample";

interface Setup {
	app: ReturnType<typeof createApp>;
	db: FakeD1;
	settingsCalls: () => number;
}

async function setup(opts: {
	bulk?: number;
	settings?: (real: () => Promise<SiteSettings>) => () => Promise<SiteSettings>;
} = {}): Promise<Setup> {
	const db = createFakeD1();
	await applyMigrations(db);
	const d1 = db as unknown as D1Database;
	await seedApiSample(d1);
	if (opts.bulk) await seedManyPublished(d1, opts.bulk);

	let calls = 0;
	const real = () => getSettings(d1, () => {});
	const counted = () => {
		calls++;
		return (opts.settings ? opts.settings(real) : real)();
	};
	const deps: ApiDeps = { db: d1, getSettings: counted };
	const app = createApp({
		getSettings: counted,
		mount: (a) => registerMetaRoutes(a, deps),
	});
	return { app, db, settingsCalls: () => calls };
}

async function countHotels(db: FakeD1): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) AS n FROM hotels")
		.first<{ n: number }>();
	return row?.n ?? -1;
}

function collectKeys(value: unknown, out: string[] = []): string[] {
	if (Array.isArray(value)) {
		for (const v of value) collectKeys(v, out);
	} else if (value !== null && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			out.push(k);
			collectKeys(v, out);
		}
	}
	return out;
}

function collectStrings(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
	else if (value !== null && typeof value === "object") {
		for (const v of Object.values(value)) collectStrings(v, out);
	}
	return out;
}

describe("GET /api/cities", () => {
	it("cities lists published-hotel cities with both names and language fallback", async () => {
		const { app } = await setup();

		const vi = await app.request("/api/cities");
		expect(vi.status).toBe(200);
		expect(await vi.json()).toEqual({
			items: [
				{ slug: "da-nang", name: "Đà Nẵng", nameVi: "Đà Nẵng", nameEn: "Da Nang" },
				{ slug: "ha-noi", name: "Hà Nội", nameVi: "Hà Nội", nameEn: null },
			],
		});

		const en = await app.request("/api/cities?lang=en");
		expect(en.status).toBe(200);
		const body = (await en.json()) as { items: Array<{ slug: string; name: string }> };
		expect(body.items.find((i) => i.slug === "da-nang")?.name).toBe("Da Nang");
		expect(body.items.find((i) => i.slug === "ha-noi")?.name).toBe("Hà Nội");
		expect(body.items.some((i) => i.slug === "hue")).toBe(false);
	});

	it("rejects an invalid lang with 400", async () => {
		const { app } = await setup();
		const res = await app.request("/api/cities?lang=fr");
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("invalid_param");
	});
});

describe("GET /api/suggest", () => {
	it("suggest returns slug, name and city for accent-free prefixes and respects limit", async () => {
		const { app, settingsCalls } = await setup({ bulk: 60 });

		const expected = [{ slug: "mong-hotel", name: "Mộng Hotel", city: "Đà Nẵng" }];
		for (const q of ["mo", "Mộng"]) {
			const res = await app.request(`/api/suggest?q=${encodeURIComponent(q)}`);
			expect(res.status, q).toBe(200);
			expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
			expect(await res.json(), q).toEqual({ items: expected });
		}

		const bulk = (await (await app.request("/api/suggest?q=bulk")).json()) as {
			items: Array<Record<string, unknown>>;
		};
		expect(bulk.items).toHaveLength(8);
		expect(Object.keys(bulk.items[0]!).sort()).toEqual(["city", "name", "slug"]);

		const ten = (await (await app.request("/api/suggest?q=bulk&limit=10")).json()) as {
			items: unknown[];
		};
		expect(ten.items).toHaveLength(10);

		const one = (await (await app.request("/api/suggest?q=bulk&limit=1")).json()) as {
			items: unknown[];
		};
		expect(one.items).toHaveLength(1);

		const en = await app.request("/api/suggest?q=mo&lang=en");
		expect(await en.json()).toEqual({
			items: [{ slug: "mong-hotel", name: "Mộng Hotel", city: "Da Nang" }],
		});

		// Suggest never reads settings.
		expect(settingsCalls()).toBe(0);
	});

	it("suggest never returns review or hidden hotels", async () => {
		const { app } = await setup();
		const res = await app.request("/api/suggest?q=mong");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ name: string }> };
		const names = body.items.map((i) => i.name);
		expect(names).not.toContain("Mộng Review");
		expect(names).not.toContain("Mộng Hidden");
		expect(names).toEqual(["Mộng Hotel"]);
	});

	it("suggest rejects empty, blank, long text and bad limit, and survives hostile text", async () => {
		const { app, db } = await setup();
		const before = await countHotels(db);

		for (const url of [
			"/api/suggest",
			"/api/suggest?q=",
			"/api/suggest?q=%20%20%20",
			`/api/suggest?q=${"a".repeat(61)}`,
		]) {
			const res = await app.request(url);
			expect(res.status, url).toBe(400);
			const body = (await res.json()) as { error: { code: string; message: string } };
			expect(body.error.code, url).toBe("invalid_q");
			expect(typeof body.error.message, url).toBe("string");
		}

		for (const limit of ["0", "11"]) {
			const res = await app.request(`/api/suggest?q=mo&limit=${limit}`);
			expect(res.status, limit).toBe(400);
			const body = (await res.json()) as { error: { code: string } };
			expect(body.error.code, limit).toBe("invalid_param");
		}

		const hostile = [
			"%25",
			"_",
			"%22*%22",
			"a%20OR%20b",
			encodeURIComponent("' OR 1=1; DROP TABLE hotels; --"),
		];
		for (const q of hostile) {
			const res = await app.request(`/api/suggest?q=${q}`);
			expect(res.status, q).toBe(200);
			const body = (await res.json()) as { items: unknown[] };
			expect(Array.isArray(body.items), q).toBe(true);
			expect(body.items, q).toEqual([]);
		}

		expect(await countHotels(db)).toBe(before);
	});
});

describe("GET /api/config", () => {
	it("config returns disclaimers, fee note flag and fee percent without contact data", async () => {
		const { app, db, settingsCalls } = await setup();

		const res = await app.request("/api/config");
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");

		const seeded = await db
			.prepare("SELECT key, value FROM settings WHERE key IN ('disclaimer_vi', 'disclaimer_en')")
			.all<{ key: string; value: string }>();
		const byKey = Object.fromEntries(seeded.results.map((r) => [r.key, r.value]));
		expect(byKey.disclaimer_vi).toBeTruthy();
		expect(byKey.disclaimer_en).toBeTruthy();

		const body = await res.json();
		expect(body).toEqual({
			disclaimer: { vi: byKey.disclaimer_vi, en: byKey.disclaimer_en },
			showFeeNote: true,
			serviceFeePercent: 10,
			languages: ["vi", "en"],
		});

		// No contact field, no phone-like value, no Zalo link.
		for (const key of collectKeys(body)) {
			expect(key).not.toMatch(/phone|zalo|tel|contact/i);
		}
		for (const str of collectStrings(body)) {
			expect(str).not.toMatch(/zalo\.me/i);
			expect(str).not.toMatch(/\+?\d[\d\s.-]{7,}\d/);
		}

		expect(settingsCalls()).toBe(1);
	});

	it("config follows a changed settings value", async () => {
		const { app } = await setup({
			settings: () => async () => ({
				serviceFeePercent: 12,
				showFeeNote: false,
				disclaimerVi: "Vi stub",
				disclaimerEn: "En stub",
			}),
		});

		const res = await app.request("/api/config");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.serviceFeePercent).toBe(12);
		expect(body.showFeeNote).toBe(false);
		expect(body.disclaimer).toEqual({ vi: "Vi stub", en: "En stub" });
	});
});

describe("base prices", () => {
	it("no base price appears in cities, suggest or config", async () => {
		const { app } = await setup({ bulk: 60 });
		for (const url of [
			"/api/cities",
			"/api/cities?lang=en",
			"/api/suggest?q=mo",
			"/api/suggest?q=bulk&limit=10",
			"/api/config",
		]) {
			const res = await app.request(url);
			expect(res.status, url).toBe(200);
			const text = await res.text();
			for (const price of SAMPLE_BASE_PRICE_STRINGS) {
				expect(text, `${url} contains ${price}`).not.toContain(price);
			}
		}
	});
});
