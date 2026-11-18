import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

// Only 0001_init.sql, so this test does not depend on later migrations.
const INIT_SQL = readFileSync(
	new URL("../../migrations/0001_init.sql", import.meta.url),
	"utf8",
);

async function freshDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await db.exec(INIT_SQL);
	return db;
}

async function run(db: FakeD1, sql: string, ...params: unknown[]): Promise<void> {
	await db.prepare(sql).bind(...params).run();
}

async function count(db: FakeD1, sql: string, ...params: unknown[]): Promise<number> {
	const row = await db.prepare(sql).bind(...params).first<{ n: number }>();
	return Number(row?.n);
}

async function seedCityAndFacility(db: FakeD1): Promise<void> {
	await run(db, "INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)", "da-nang", "Đà Nẵng", "Da Nang");
	await run(
		db,
		"INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, ?, ?, ?)",
		"pool",
		"facility",
		"Hồ bơi",
		"Pool",
	);
}

async function insertHotel(db: FakeD1, id: string, status?: string): Promise<void> {
	const base = [
		id,
		`slug-${id}`,
		"da-nang",
		`Khách sạn ${id}`,
		`khach san ${id}`,
		`file-${id}`,
		"gid-0",
		"hash",
		"2026-11-18T00:00:00Z",
	];
	if (status === undefined) {
		await run(
			db,
			"INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			...base,
		);
	} else {
		await run(
			db,
			"INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			...base,
			status,
		);
	}
}

async function insertRoom(db: FakeD1, id: string, hotelId: string, basePrice: unknown = null): Promise<void> {
	await run(
		db,
		"INSERT INTO rooms (id, hotel_id, name, name_search, base_price, source) VALUES (?, ?, ?, ?, ?, 'sheet')",
		id,
		hotelId,
		`Phòng ${id}`,
		`phong ${id}`,
		basePrice,
	);
}

async function insertRule(
	db: FakeD1,
	id: string,
	hotelId: string,
	roomId: string | null,
	rawText = `rule ${id}`,
): Promise<void> {
	await run(
		db,
		"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, ?, ?, ?)",
		id,
		hotelId,
		roomId,
		rawText,
		"2026-11-18T00:00:00Z",
	);
}

describe("0001_init.sql", () => {
	it("creates all required tables on an empty database", async () => {
		const db = await freshDb();
		const rows = await db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all<{ name: string }>();
		const names = rows.results.map((r) => r.name);
		for (const table of [
			"cities",
			"hotels",
			"rooms",
			"facility_catalog",
			"hotel_facilities",
			"hotel_images",
			"booking_rules",
			"settings",
			"overrides",
		]) {
			expect(names).toContain(table);
		}
	});

	it("can be applied twice without error and keeps data", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");
		await insertRoom(db, "r1", "h1", 1250000);

		await expect(db.exec(INIT_SQL)).resolves.toBeDefined();

		expect(await count(db, "SELECT COUNT(*) AS n FROM cities")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotels")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM rooms")).toBe(1);
		const room = await db
			.prepare("SELECT name, base_price FROM rooms WHERE id = ?")
			.bind("r1")
			.first<{ name: string; base_price: number }>();
		expect(room?.name).toBe("Phòng r1");
		expect(room?.base_price).toBe(1250000);
	});

	it("hotel status accepts review, published, hidden and defaults to review", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);

		await insertHotel(db, "h-default");
		await insertHotel(db, "h-review", "review");
		await insertHotel(db, "h-published", "published");
		await insertHotel(db, "h-hidden", "hidden");

		const status = await db
			.prepare("SELECT status FROM hotels WHERE id = ?")
			.bind("h-default")
			.first<{ status: string }>();
		expect(status?.status).toBe("review");

		for (const id of ["h-review", "h-published", "h-hidden"]) {
			const row = await db
				.prepare("SELECT status FROM hotels WHERE id = ?")
				.bind(id)
				.first<{ status: string }>();
			expect(row?.status).toBe(id.replace("h-", ""));
		}
	});

	it("hotel status rejects any other value", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);

		await expect(insertHotel(db, "h-live", "live")).rejects.toThrow();
		await expect(insertHotel(db, "h-empty", "")).rejects.toThrow();
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotels")).toBe(0);
	});

	it("booking rule at hotel level and room level, raw text kept verbatim with synced_at", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");
		await insertRoom(db, "r1", "h1");

		const rawText = "  Nhận phòng từ 14:00\nKhông hút thuốc lá, có phụ thu  ";
		await insertRule(db, "rule-hotel", "h1", null, rawText);
		await insertRule(db, "rule-room", "h1", "r1", "Phòng này không hoàn tiền");

		const hotelRule = await db
			.prepare("SELECT room_id, raw_text, synced_at FROM booking_rules WHERE id = ?")
			.bind("rule-hotel")
			.first<{ room_id: string | null; raw_text: string; synced_at: string }>();
		expect(hotelRule?.room_id).toBeNull();
		expect(hotelRule?.raw_text).toBe(rawText);
		expect(hotelRule?.synced_at).toBe("2026-11-18T00:00:00Z");

		const roomRule = await db
			.prepare("SELECT room_id FROM booking_rules WHERE id = ?")
			.bind("rule-room")
			.first<{ room_id: string | null }>();
		expect(roomRule?.room_id).toBe("r1");
	});

	it("booking rule requires raw_text and synced_at and a real room", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");
		await insertRoom(db, "r1", "h1");

		await expect(
			run(
				db,
				"INSERT INTO booking_rules (id, hotel_id, room_id, synced_at) VALUES (?, ?, ?, ?)",
				"no-raw",
				"h1",
				null,
				"2026-11-18T00:00:00Z",
			),
		).rejects.toThrow();

		await expect(
			run(
				db,
				"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text) VALUES (?, ?, ?, ?)",
				"no-synced",
				"h1",
				null,
				"text",
			),
		).rejects.toThrow();

		await expect(insertRule(db, "bad-room", "h1", "missing-room")).rejects.toThrow();

		expect(await count(db, "SELECT COUNT(*) AS n FROM booking_rules")).toBe(0);
	});

	it("room price accepts whole VND and NULL", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");

		await insertRoom(db, "r-price", "h1", 1250000);
		await insertRoom(db, "r-null", "h1", null);

		const priced = await db
			.prepare("SELECT base_price FROM rooms WHERE id = ?")
			.bind("r-price")
			.first<{ base_price: number }>();
		expect(priced?.base_price).toBe(1250000);

		const unpriced = await db
			.prepare("SELECT base_price FROM rooms WHERE id = ?")
			.bind("r-null")
			.first<{ base_price: number | null }>();
		expect(unpriced?.base_price).toBeNull();
	});

	it("room price rejects fractions, text and negatives", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");

		await expect(insertRoom(db, "r-frac", "h1", 1250000.5)).rejects.toThrow();
		await expect(insertRoom(db, "r-text", "h1", "abc")).rejects.toThrow();
		await expect(insertRoom(db, "r-neg", "h1", -1)).rejects.toThrow();

		expect(await count(db, "SELECT COUNT(*) AS n FROM rooms")).toBe(0);
	});

	it("deleting a hotel removes rooms, facilities, images and rules", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");
		await insertHotel(db, "h2");
		await insertRoom(db, "r1", "h1", 1000000);
		await insertRoom(db, "r2", "h2", 2000000);
		await run(
			db,
			"INSERT INTO hotel_facilities (hotel_id, code, source) VALUES (?, ?, 'sheet')",
			"h1",
			"pool",
		);
		await run(
			db,
			"INSERT INTO hotel_facilities (hotel_id, code, source) VALUES (?, ?, 'sheet')",
			"h2",
			"pool",
		);
		await run(db, "INSERT INTO hotel_images (hotel_id, url) VALUES (?, ?)", "h1", "https://img/1.jpg");
		await run(db, "INSERT INTO hotel_images (hotel_id, url) VALUES (?, ?)", "h2", "https://img/2.jpg");
		await insertRule(db, "rule-h1-hotel", "h1", null);
		await insertRule(db, "rule-h1-room", "h1", "r1");
		await insertRule(db, "rule-h2-hotel", "h2", null);

		await run(db, "DELETE FROM hotels WHERE id = ?", "h1");

		expect(await count(db, "SELECT COUNT(*) AS n FROM rooms WHERE hotel_id = 'h1'")).toBe(0);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotel_facilities WHERE hotel_id = 'h1'")).toBe(0);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotel_images WHERE hotel_id = 'h1'")).toBe(0);
		expect(await count(db, "SELECT COUNT(*) AS n FROM booking_rules WHERE hotel_id = 'h1'")).toBe(0);

		expect(await count(db, "SELECT COUNT(*) AS n FROM hotels WHERE id = 'h2'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM rooms WHERE id = 'r2'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotel_facilities WHERE hotel_id = 'h2'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotel_images WHERE hotel_id = 'h2'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM booking_rules WHERE id = 'rule-h2-hotel'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM cities WHERE slug = 'da-nang'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM facility_catalog WHERE code = 'pool'")).toBe(1);
	});

	it("deleting a room removes only its room-level rules", async () => {
		const db = await freshDb();
		await seedCityAndFacility(db);
		await insertHotel(db, "h1");
		await insertRoom(db, "r1", "h1");
		await insertRule(db, "rule-hotel", "h1", null);
		await insertRule(db, "rule-room", "h1", "r1");

		await run(db, "DELETE FROM rooms WHERE id = ?", "r1");

		expect(await count(db, "SELECT COUNT(*) AS n FROM booking_rules WHERE id = 'rule-room'")).toBe(0);
		expect(await count(db, "SELECT COUNT(*) AS n FROM booking_rules WHERE id = 'rule-hotel'")).toBe(1);
		expect(await count(db, "SELECT COUNT(*) AS n FROM hotels WHERE id = 'h1'")).toBe(1);
	});
});
