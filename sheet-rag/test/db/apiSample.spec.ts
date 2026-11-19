import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import {
	BASE_PRICE_DELUXE,
	BASE_PRICE_SAO,
	SAMPLE_BASE_PRICE_STRINGS,
	seedApiSample,
	seedManyPublished,
} from "../fixtures/apiSample";

// The fixture takes a D1Database; the fake is cast the same way the other tests do.
async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

async function count(db: FakeD1, sql: string): Promise<number> {
	const row = await db.prepare(sql).first<{ n: number }>();
	return Number(row?.n);
}

describe("apiSample fixture", () => {
	it("seeds 5 hotels with the expected statuses, cities, rooms and rules", async () => {
		const db = await sampleDb();

		const hotels = await db
			.prepare("SELECT id, status FROM hotels ORDER BY id")
			.all<{ id: string; status: string }>();
		expect(hotels.results).toEqual([
			{ id: "h1", status: "published" },
			{ id: "h2", status: "published" },
			{ id: "h3", status: "published" },
			{ id: "h4", status: "review" },
			{ id: "h5", status: "hidden" },
		]);

		const cities = await db
			.prepare("SELECT slug, name_vi, name_en FROM cities ORDER BY slug")
			.all();
		expect(cities.results).toEqual([
			{ slug: "da-nang", name_vi: "Đà Nẵng", name_en: "Da Nang" },
			{ slug: "ha-noi", name_vi: "Hà Nội", name_en: null },
			{ slug: "hue", name_vi: "Huế", name_en: "Hue" },
		]);

		const rooms = await db
			.prepare("SELECT id, hotel_id, name, base_price FROM rooms ORDER BY id")
			.all();
		expect(rooms.results).toEqual([
			{ id: "r1", hotel_id: "h1", name: "Deluxe", base_price: 1250000 },
			{ id: "r2", hotel_id: "h1", name: "Standard", base_price: null },
			{ id: "r3", hotel_id: "h2", name: "Superior", base_price: 980000 },
			{ id: "r4", hotel_id: "h4", name: "Deluxe", base_price: 555000 },
			{ id: "r5", hotel_id: "h5", name: "Deluxe", base_price: 444000 },
		]);

		const rules = await db
			.prepare(
				"SELECT id, hotel_id, room_id, raw_text, status, synced_at FROM booking_rules ORDER BY id",
			)
			.all();
		expect(rules.results).toEqual([
			{
				id: "rule-h1",
				hotel_id: "h1",
				room_id: null,
				raw_text: "Nhận phòng 14:00\n  Trả phòng 12:00 (có dấu cách thừa) ",
				status: "confirmed",
				synced_at: "2026-11-17T02:00:00Z",
			},
			{
				id: "rule-r1",
				hotel_id: "h1",
				room_id: "r1",
				raw_text: "Hủy phòng trước 3 ngày, phí 50%",
				status: "confirmed",
				synced_at: "2026-11-16T02:00:00Z",
			},
		]);

		const facilities = await db
			.prepare(
				"SELECT hotel_id, code, confirmed FROM hotel_facilities ORDER BY hotel_id, code",
			)
			.all();
		expect(facilities.results).toEqual([
			{ hotel_id: "h1", code: "parking", confirmed: 0 },
			{ hotel_id: "h1", code: "pool", confirmed: 1 },
			{ hotel_id: "h2", code: "parking", confirmed: 1 },
			{ hotel_id: "h3", code: "elevator", confirmed: 1 },
			{ hotel_id: "h3", code: "pool", confirmed: 1 },
		]);

		const catalog = await db
			.prepare("SELECT code, category, label_vi, label_en FROM facility_catalog ORDER BY code")
			.all();
		expect(catalog.results).toEqual([
			{ code: "elevator", category: "facility", label_vi: "Thang máy", label_en: "Elevator" },
			{ code: "parking", category: "facility", label_vi: "Chỗ đậu xe", label_en: "Parking" },
			{ code: "pool", category: "facility", label_vi: "Hồ bơi", label_en: "Swimming pool" },
		]);

		const images = await db
			.prepare("SELECT hotel_id, url, position, alt_vi FROM hotel_images ORDER BY position")
			.all();
		expect(images.results).toEqual([
			{ hotel_id: "h1", url: "https://example.test/mong-0.jpg", position: 0, alt_vi: "Sảnh khách sạn" },
			{ hotel_id: "h1", url: "https://example.test/mong-1.jpg", position: 1, alt_vi: null },
		]);

		const h1 = await db
			.prepare(
				"SELECT slug, city_slug, stars, name, name_search, description_vi, description_en, address, synced_at FROM hotels WHERE id = 'h1'",
			)
			.first();
		expect(h1).toMatchObject({
			city_slug: "da-nang",
			stars: 4,
			name: "Mộng Hotel",
			name_search: "mong hotel",
			synced_at: "2026-11-18T03:00:00Z",
		});
		expect(h1?.description_vi).toEqual(expect.any(String));
		expect(h1?.description_en).toEqual(expect.any(String));
		expect(h1?.address).toEqual(expect.any(String));
	});

	it("keeps the default settings from the migration", async () => {
		const db = await sampleDb();

		const settings = await db
			.prepare("SELECT key, value FROM settings ORDER BY key")
			.all<{ key: string; value: string }>();
		const map = Object.fromEntries(settings.results.map((r) => [r.key, r.value]));
		expect(map.service_fee_percent).toBe("10");
		expect(map.show_fee_note).toBe("true");
		expect(map.data_version).toBe("1");
		expect(map.disclaimer_vi).toEqual(expect.any(String));
		expect(map.disclaimer_en).toEqual(expect.any(String));
		expect(map.sync_auto_publish).toBe("true");
		expect(settings.results).toHaveLength(6);
	});

	it("seedManyPublished adds 60 published hotels", async () => {
		const db = await sampleDb();
		const before = await count(db, "SELECT COUNT(*) AS n FROM hotels WHERE status = 'published'");

		await seedManyPublished(db as unknown as D1Database, 60);

		const after = await count(db, "SELECT COUNT(*) AS n FROM hotels WHERE status = 'published'");
		expect(after - before).toBe(60);
		const bulk = await count(db, "SELECT COUNT(*) AS n FROM hotels WHERE city_slug = 'ha-noi' AND id LIKE 'bulk-%'");
		expect(bulk).toBe(60);
	});

	it("price string list contains every seeded base price", async () => {
		const db = await sampleDb();
		const rows = await db
			.prepare("SELECT DISTINCT base_price FROM rooms WHERE base_price IS NOT NULL")
			.all<{ base_price: number }>();
		const seeded = rows.results.map((r) => r.base_price);
		expect(seeded.sort((a, b) => a - b)).toEqual([444000, 555000, 980000, 1250000]);

		expect(BASE_PRICE_DELUXE).toBe(1250000);
		expect(BASE_PRICE_SAO).toBe(980000);
		for (const price of seeded) {
			expect(SAMPLE_BASE_PRICE_STRINGS).toContain(String(price));
			expect(SAMPLE_BASE_PRICE_STRINGS).toContain(
				String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
			);
		}
	});

	it("runs with no CLOUDFLARE_API_TOKEN", async () => {
		// Node's process is not typed in this tsconfig, so read the env through globalThis.
		const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
			?.env;
		const saved = env?.CLOUDFLARE_API_TOKEN;
		if (env) delete env.CLOUDFLARE_API_TOKEN;
		try {
			const db = await sampleDb();
			expect(await count(db, "SELECT COUNT(*) AS n FROM hotels")).toBe(5);
		} finally {
			if (env && saved !== undefined) env.CLOUDFLARE_API_TOKEN = saved;
		}
	});
});
