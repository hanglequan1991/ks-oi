import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/web/app";
import { registerHotelRoutes } from "../../../src/web/api/hotels";
import type { SiteSettings } from "../../../src/db/settings";
import { createFakeD1, type FakeD1 } from "../../fakes/d1";
import { applyMigrations } from "../../fakes/migrations";
import { SAMPLE_BASE_PRICE_STRINGS, seedApiSample, seedManyPublished } from "../../fixtures/apiSample";

const SETTINGS: SiteSettings = {
	serviceFeePercent: 10,
	showFeeNote: true,
	disclaimerVi: "Giá có thể thay đổi.",
	disclaimerEn: "Prices may change.",
};

async function sampleDb(extraHotels = 0): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	if (extraHotels > 0) await seedManyPublished(db as unknown as D1Database, extraHotels);
	return db;
}

function buildApp(db: FakeD1, settings: SiteSettings = SETTINGS) {
	const getSettings = vi.fn(async () => settings);
	const app = createApp({
		getSettings,
		mount: (a) => registerHotelRoutes(a, { db: db as unknown as D1Database, getSettings }),
	});
	return { app, getSettings };
}

// Shape of the list and detail bodies, used by the tests below.
interface ListBody {
	items: Array<{ slug: string; price: { amount: number; includesFeePercent?: number } | null }>;
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

interface DetailBody {
	slug: string;
	description: string | null;
	city: { name: string };
	facilities: Array<{ code: string; label: string }>;
	images: unknown[];
	rooms: Array<{
		name: string;
		price: { amount: number; currency: string; unit: string } | null;
		bookingRules: { text: string; syncedAt: string } | null;
	}>;
	bookingRules: { text: string; syncedAt: string } | null;
}

async function getJson<T>(app: ReturnType<typeof buildApp>["app"], path: string): Promise<{ status: number; body: T; text: string }> {
	const res = await app.request(path);
	const text = await res.text();
	return { status: res.status, body: JSON.parse(text) as T, text };
}

function slugs(body: ListBody): string[] {
	return body.items.map((item) => item.slug);
}

describe("GET /api/hotels", () => {
	it("list returns published hotels with final prices and paging", async () => {
		const { app } = buildApp(await sampleDb());
		const { status, body } = await getJson<ListBody>(app, "/api/hotels");

		expect(status).toBe(200);
		expect(body.total).toBe(3);
		expect(body.page).toBe(1);
		expect(body.limit).toBe(20);
		expect(body.totalPages).toBe(1);
		expect(body.items).toHaveLength(3);
		for (const item of body.items) {
			expect(item).toHaveProperty("price");
		}
		expect(slugs(body)).not.toContain("mong-review");
		expect(slugs(body)).not.toContain("mong-hidden");

		const paged = await getJson<ListBody>(buildApp(await sampleDb(60)).app, "/api/hotels?limit=50&page=2");
		expect(paged.status).toBe(200);
		expect(paged.body.items).toHaveLength(13);
		expect(paged.body.totalPages).toBe(2);
		expect(paged.body.total).toBe(63);
		expect(paged.body.limit).toBe(50);
	});

	it("list filters by city, stars, facility and accent-free text", async () => {
		const { app } = buildApp(await sampleDb());

		const city = await getJson<ListBody>(app, "/api/hotels?city=da-nang");
		expect(slugs(city.body).sort()).toEqual(["dong-do-hotel", "mong-hotel"]);

		const stars = await getJson<ListBody>(app, "/api/hotels?stars=5");
		expect(slugs(stars.body)).toEqual(["dong-do-hotel"]);

		const facility = await getJson<ListBody>(app, "/api/hotels?facility=pool");
		expect(slugs(facility.body).sort()).toEqual(["dong-do-hotel", "mong-hotel"]);

		const accented = await getJson<ListBody>(app, `/api/hotels?q=${encodeURIComponent("Mộng")}`);
		expect(slugs(accented.body)).toEqual(["mong-hotel"]);

		const plain = await getJson<ListBody>(app, "/api/hotels?q=mong");
		expect(slugs(plain.body)).toEqual(["mong-hotel"]);
	});

	it("oversized limit is capped at 50 and invalid values give 400", async () => {
		const { app, getSettings } = buildApp(await sampleDb());

		const capped = await getJson<ListBody>(app, "/api/hotels?limit=500");
		expect(capped.status).toBe(200);
		expect(capped.body.limit).toBe(50);

		getSettings.mockClear();
		const bad = [
			"limit=abc",
			"stars=9",
			"sort=zzz",
			"page=0",
			"city=Da%20Nang",
		];
		for (const query of bad) {
			const res = await app.request(`/api/hotels?${query}`);
			expect(res.status, query).toBe(400);
			const body = (await res.json()) as { error: { code: string; message: string } };
			expect(body.error.code).toBe("invalid_param");
			const param = query.split("=")[0];
			expect(body.error.message, query).toContain(param);
		}
		// Invalid input runs no query and reads no settings.
		expect(getSettings).not.toHaveBeenCalled();
	});

	it("list responses carry Cache-Control only on 200", async () => {
		const { app } = buildApp(await sampleDb());
		const ok = await app.request("/api/hotels");
		expect(ok.headers.get("Cache-Control")).toBe("public, max-age=60");
		const bad = await app.request("/api/hotels?page=0");
		expect(bad.headers.get("Cache-Control")).toBeNull();
	});

	it("unpriced hotels in the list carry null price, never zero", async () => {
		const { app } = buildApp(await sampleDb());
		const { body } = await getJson<ListBody>(app, "/api/hotels");
		const dong = body.items.find((item) => item.slug === "dong-do-hotel");
		expect(dong?.price).toBeNull();
	});
});

describe("GET /api/hotels/:slug", () => {
	it("detail returns rooms, facilities, images and rules in both languages", async () => {
		const { app } = buildApp(await sampleDb());

		const vi = await getJson<DetailBody>(app, "/api/hotels/mong-hotel");
		expect(vi.status).toBe(200);
		expect(vi.body.facilities.map((f) => f.code)).toEqual(["parking", "pool"]);
		expect(vi.body.images).toHaveLength(2);
		expect(vi.body.rooms.map((r) => r.name)).toEqual(["Deluxe", "Standard"]);
		expect(vi.body.bookingRules?.text).toBe("Nhận phòng 14:00\n  Trả phòng 12:00 (có dấu cách thừa) ");
		expect(vi.body.bookingRules?.syncedAt).toBe("2026-11-17T02:00:00Z");
		const deluxe = vi.body.rooms.find((r) => r.name === "Deluxe");
		expect(deluxe?.bookingRules?.text).toBe("Hủy phòng trước 3 ngày, phí 50%");
		expect(deluxe?.bookingRules?.syncedAt).toBe("2026-11-16T02:00:00Z");
		expect(vi.body.description).toBe("Khách sạn gần biển tại Đà Nẵng.");

		const en = await getJson<DetailBody>(app, "/api/hotels/mong-hotel?lang=en");
		expect(en.status).toBe(200);
		expect(en.body.description).toBe("A hotel near the beach in Da Nang.");
		expect(en.body.city.name).toBe("Da Nang");
		expect(en.body.facilities.map((f) => f.label)).toEqual(["Parking", "Swimming pool"]);
	});

	it("detail is 404 for review, hidden, unknown and malformed slugs", async () => {
		const { app, getSettings } = buildApp(await sampleDb());
		for (const slug of ["mong-review", "mong-hidden", "khong-co", "Mong_Hotel", "bad%20slug"]) {
			const res = await app.request(`/api/hotels/${slug}`);
			expect(res.status, slug).toBe(404);
			const body = (await res.json()) as { error: { code: string } };
			expect(body.error.code, slug).toBe("not_found");
		}
		// Unknown and unpublished slugs never read settings.
		expect(getSettings).not.toHaveBeenCalled();
	});

	it("detail responses carry Cache-Control only on 200", async () => {
		const { app } = buildApp(await sampleDb());
		const ok = await app.request("/api/hotels/mong-hotel");
		expect(ok.headers.get("Cache-Control")).toBe("public, max-age=60");
		const missing = await app.request("/api/hotels/khong-co");
		expect(missing.headers.get("Cache-Control")).toBeNull();
	});
});

describe("prices", () => {
	it("1,250,000 base price is returned as 1,375,000", async () => {
		const { app } = buildApp(await sampleDb());

		const detail = await getJson<DetailBody>(app, "/api/hotels/mong-hotel");
		const deluxe = detail.body.rooms.find((r) => r.name === "Deluxe");
		expect(deluxe?.price).toEqual({ amount: 1375000, currency: "VND", unit: "night", includesFeePercent: 10 });

		const list = await getJson<ListBody>(app, "/api/hotels");
		const mong = list.body.items.find((item) => item.slug === "mong-hotel");
		expect(mong?.price?.amount).toBe(1375000);
		const sao = list.body.items.find((item) => item.slug === "sao-hotel");
		expect(sao?.price?.amount).toBe(1078000);
	});

	it("unpriced rooms and hotels carry null, never zero", async () => {
		const { app } = buildApp(await sampleDb());

		const detail = await getJson<DetailBody>(app, "/api/hotels/mong-hotel");
		const standard = detail.body.rooms.find((r) => r.name === "Standard");
		expect(standard?.price).toBeNull();

		const list = await getJson<ListBody>(app, "/api/hotels");
		const dong = list.body.items.find((item) => item.slug === "dong-do-hotel");
		expect(dong?.price).toBeNull();

		expect(list.text).not.toMatch(/"amount":0\b/);
		expect(detail.text).not.toMatch(/"amount":0\b/);
	});

	it("changed fee setting changes prices, clamped to 0..100", async () => {
		const db = await sampleDb();

		const twenty = buildApp(db, { ...SETTINGS, serviceFeePercent: 20 });
		const d20 = await getJson<DetailBody>(twenty.app, "/api/hotels/mong-hotel");
		expect(d20.body.rooms.find((r) => r.name === "Deluxe")?.price?.amount).toBe(1500000);
		expect(twenty.getSettings).toHaveBeenCalledTimes(1);

		const huge = buildApp(db, { ...SETTINGS, serviceFeePercent: 150 });
		const d150 = await getJson<DetailBody>(huge.app, "/api/hotels/mong-hotel");
		expect(d150.body.rooms.find((r) => r.name === "Deluxe")?.price?.amount).toBe(2500000);
		expect(huge.getSettings).toHaveBeenCalledTimes(1);

		const list = buildApp(db, { ...SETTINGS, serviceFeePercent: 20 });
		await getJson<ListBody>(list.app, "/api/hotels");
		expect(list.getSettings).toHaveBeenCalledTimes(1);
	});

	it("fee note flag controls includesFeePercent", async () => {
		const db = await sampleDb();

		const on = buildApp(db, { ...SETTINGS, showFeeNote: true, serviceFeePercent: 15 });
		const withNote = await getJson<ListBody>(on.app, "/api/hotels");
		const mongOn = withNote.body.items.find((item) => item.slug === "mong-hotel");
		expect(mongOn?.price?.includesFeePercent).toBe(15);

		const off = buildApp(db, { ...SETTINGS, showFeeNote: false, serviceFeePercent: 15 });
		const noNote = await getJson<ListBody>(off.app, "/api/hotels");
		const mongOff = noNote.body.items.find((item) => item.slug === "mong-hotel");
		expect(mongOff?.price).not.toHaveProperty("includesFeePercent");
		expect(noNote.text).not.toContain("includesFeePercent");

		const detail = await getJson<DetailBody>(off.app, "/api/hotels/mong-hotel");
		expect(detail.text).not.toContain("includesFeePercent");
	});

	it("no base price appears in any list or detail response", async () => {
		const { app } = buildApp(await sampleDb());
		const texts: string[] = [];
		texts.push(await (await app.request("/api/hotels")).text());
		texts.push(await (await app.request("/api/hotels?limit=50")).text());
		for (const slug of ["mong-hotel", "sao-hotel", "dong-do-hotel"]) {
			const res = await app.request(`/api/hotels/${slug}`);
			expect(res.status, slug).toBe(200);
			texts.push(await res.text());
			const en = await app.request(`/api/hotels/${slug}?lang=en`);
			texts.push(await en.text());
		}
		for (const text of texts) {
			for (const forbidden of SAMPLE_BASE_PRICE_STRINGS) {
				expect(text).not.toContain(forbidden);
			}
			expect(text).not.toContain("base_price");
		}
	});
});

describe("robustness", () => {
	it("settings failure gives 500", async () => {
		const db = await sampleDb();
		const failing = vi.fn(async () => {
			throw new Error("settings unavailable");
		});
		const app = createApp({
			getSettings: failing,
			mount: (a) => registerHotelRoutes(a, { db: db as unknown as D1Database, getSettings: failing }),
		});
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const list = await app.request("/api/hotels");
		expect(list.status).toBe(500);
		const detail = await app.request("/api/hotels/mong-hotel");
		expect(detail.status).toBe(500);

		errSpy.mockRestore();
	});
});
