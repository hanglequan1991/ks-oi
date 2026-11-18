import { describe, expect, it } from "vitest";
import { getPublishedHotelDetail } from "../../src/db/hotelDetail";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { BASE_PRICE_DELUXE, seedApiSample } from "../fixtures/apiSample";

// The fixture takes a D1Database; the fake is cast the same way the other tests do.
async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

async function roomId(db: FakeD1, name: string): Promise<string> {
	const row = await db
		.prepare("SELECT id FROM rooms WHERE name = ? AND hotel_id = 'h1'")
		.bind(name)
		.first<{ id: string }>();
	return String(row?.id);
}

describe("getPublishedHotelDetail", () => {
	it("loads rooms, images, facilities and both rule levels for a published hotel", async () => {
		const db = await sampleDb();
		const detail = await getPublishedHotelDetail(db as unknown as D1Database, "mong-hotel");

		expect(detail).not.toBeNull();
		expect(detail?.hotel.slug).toBe("mong-hotel");
		expect(detail?.hotel.city_name_vi).toBe("Đà Nẵng");

		expect(detail?.rooms.map((room) => room.name)).toEqual(["Deluxe", "Standard"]);

		expect(detail?.images.map((image) => image.url)).toEqual([
			"https://example.test/mong-0.jpg",
			"https://example.test/mong-1.jpg",
		]);

		expect(detail?.facilities.map((f) => f.code)).toEqual(["parking", "pool"]);
		expect(detail?.facilities[0]).toMatchObject({
			code: "parking",
			label_vi: "Chỗ đậu xe",
			label_en: "Parking",
			confirmed: 0,
		});
		expect(detail?.facilities[1]).toMatchObject({
			code: "pool",
			label_vi: "Hồ bơi",
			label_en: "Swimming pool",
			confirmed: 1,
		});

		const deluxeId = await roomId(db, "Deluxe");
		const roomIds = detail?.rules.map((rule) => rule.room_id);
		expect(roomIds).toHaveLength(2);
		expect(roomIds).toContain(null);
		expect(roomIds).toContain(deluxeId);
	});

	it("keeps rule text and sync dates exactly as stored", async () => {
		const db = await sampleDb();
		const detail = await getPublishedHotelDetail(db as unknown as D1Database, "mong-hotel");

		const stored = await db
			.prepare("SELECT id, raw_text, synced_at FROM booking_rules WHERE hotel_id = 'h1'")
			.all<{ id: string; raw_text: string; synced_at: string }>();
		const byText = new Map(stored.results.map((row) => [row.raw_text, row.synced_at]));

		expect(detail?.rules).toHaveLength(2);
		for (const rule of detail?.rules ?? []) {
			expect(byText.has(rule.raw_text)).toBe(true);
			expect(rule.synced_at).toBe(byText.get(rule.raw_text));
		}

		const hotelRule = detail?.rules.find((rule) => rule.room_id === null);
		expect(hotelRule?.raw_text).toBe("Nhận phòng 14:00\n  Trả phòng 12:00 (có dấu cách thừa) ");
		expect(hotelRule?.synced_at).toBe("2026-11-17T02:00:00Z");

		// Newest rule first.
		expect(detail?.rules[0].room_id).toBeNull();
	});

	it("returns the base price of priced rooms and null for unpriced rooms", async () => {
		const db = await sampleDb();
		const detail = await getPublishedHotelDetail(db as unknown as D1Database, "mong-hotel");

		const deluxe = detail?.rooms.find((room) => room.name === "Deluxe");
		const standard = detail?.rooms.find((room) => room.name === "Standard");
		expect(deluxe?.base_price).toBe(BASE_PRICE_DELUXE);
		expect(deluxe?.base_price).toBe(1250000);
		expect(standard?.base_price).toBeNull();
	});

	it("returns null for review, hidden and unknown hotels", async () => {
		const db = await sampleDb();
		const d1 = db as unknown as D1Database;

		expect(await getPublishedHotelDetail(d1, "mong-review")).toBeNull();
		expect(await getPublishedHotelDetail(d1, "mong-hidden")).toBeNull();
		expect(await getPublishedHotelDetail(d1, "khong-co")).toBeNull();
	});

	it("returns empty lists for a hotel with no rooms or rules", async () => {
		const db = await sampleDb();
		const detail = await getPublishedHotelDetail(db as unknown as D1Database, "dong-do-hotel");

		expect(detail).not.toBeNull();
		expect(detail?.rooms).toEqual([]);
		expect(detail?.rules).toEqual([]);
		expect(detail?.images).toEqual([]);
		// The seed gives this hotel facilities, so they are returned as stored, not emptied.
		expect(Array.isArray(detail?.facilities)).toBe(true);
		expect(detail?.facilities.map((f) => f.code)).toEqual(["elevator", "pool"]);
	});

	it("a hostile slug returns null without error", async () => {
		const db = await sampleDb();
		const result = await getPublishedHotelDetail(
			db as unknown as D1Database,
			"x' OR '1'='1",
		);
		expect(result).toBeNull();
	});
});
