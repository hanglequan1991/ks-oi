// TC-8: Removing a hotel removes its rooms, facilities, images and booking rules (STORY-13, AC9).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite, foreign keys on), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

const CITY = { slug: "da-nang", name_vi: "Da Nang", name_en: "Da Nang" };
const FACILITIES = [
	{ code: "pool", category: "facility", label_vi: "Hồ bơi", label_en: "Pool" },
	{ code: "parking", category: "facility", label_vi: "Bãi đỗ xe", label_en: "Parking" },
];

const HOTEL_A = "aaaaaaaaaaaaaaaa";
const HOTEL_B = "bbbbbbbbbbbbbbbb";

function hotel(id: string, slug: string) {
	return {
		id,
		slug,
		city_slug: CITY.slug,
		name: `Hotel ${slug}`,
		name_search: `hotel ${slug}`,
		source_file_id: `file-${slug}`,
		source_gid: "0",
		source_hash: `hash-${slug}`,
		synced_at: "2026-11-18T00:00:00Z",
	};
}

async function run(db: FakeD1, sql: string, params: unknown[] = []): Promise<void> {
	await db.prepare(sql).bind(...params).run();
}

async function countWhere(db: FakeD1, table: string, where: string, params: unknown[] = []): Promise<number> {
	const row = await db
		.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`)
		.bind(...params)
		.first<{ n: number }>();
	return Number(row?.n ?? 0);
}

async function countAll(db: FakeD1, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).first<{ n: number }>();
	return Number(row?.n ?? 0);
}

async function insertHotel(db: FakeD1, h: ReturnType<typeof hotel>): Promise<void> {
	await run(
		db,
		`INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[h.id, h.slug, h.city_slug, h.name, h.name_search, h.source_file_id, h.source_gid, h.source_hash, h.synced_at],
	);
}

async function insertRoom(db: FakeD1, id: string, hotelId: string, name: string): Promise<void> {
	await run(
		db,
		`INSERT INTO rooms (id, hotel_id, name, name_search, source) VALUES (?, ?, ?, ?, 'sheet')`,
		[id, hotelId, name, name.toLowerCase()],
	);
}

async function insertRule(
	db: FakeD1,
	id: string,
	hotelId: string,
	roomId: string | null,
	rawText: string,
): Promise<void> {
	await run(
		db,
		`INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, ?, ?, ?)`,
		[id, hotelId, roomId, rawText, "2026-11-18T00:00:00Z"],
	);
}

async function insertFacilityLink(db: FakeD1, hotelId: string, code: string): Promise<void> {
	await run(
		db,
		`INSERT INTO hotel_facilities (hotel_id, code, source) VALUES (?, ?, 'sheet')`,
		[hotelId, code],
	);
}

async function insertImage(db: FakeD1, hotelId: string, url: string): Promise<void> {
	await run(db, `INSERT INTO hotel_images (hotel_id, url) VALUES (?, ?)`, [hotelId, url]);
}

test.describe("TC-8: removing a hotel removes its rooms, facilities, images and booking rules", () => {
	// This test does not use a browser page. Run it once, under the first project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("deleting hotel A cascades to its children only, and a room delete removes its room-level rule", async () => {
		// Step 1: fresh fake D1, migrations applied, one city and two facility_catalog entries.
		const db = createFakeD1();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		await run(db, `INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)`, [
			CITY.slug,
			CITY.name_vi,
			CITY.name_en,
		]);
		for (const f of FACILITIES) {
			await run(
				db,
				`INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, ?, ?, ?)`,
				[f.code, f.category, f.label_vi, f.label_en],
			);
		}

		// Step 2 (expected 2): hotel A with 2 rooms, 2 facility links, 2 images, one hotel-level rule and one room-level rule.
		await insertHotel(db, hotel(HOTEL_A, "hotel-a"));
		await insertRoom(db, "room-a1", HOTEL_A, "Deluxe");
		await insertRoom(db, "room-a2", HOTEL_A, "Suite");
		await insertFacilityLink(db, HOTEL_A, "pool");
		await insertFacilityLink(db, HOTEL_A, "parking");
		await insertImage(db, HOTEL_A, "https://img.example/a-1.jpg");
		await insertImage(db, HOTEL_A, "https://img.example/a-2.jpg");
		await insertRule(db, "rule-a-hotel", HOTEL_A, null, "Huy trước 3 ngày");
		await insertRule(db, "rule-a-room", HOTEL_A, "room-a1", "Phòng Deluxe không hoàn tiền");

		// Step 3 (expected 3): hotel B with 1 room, 1 facility link, 1 image, one hotel-level rule.
		await insertHotel(db, hotel(HOTEL_B, "hotel-b"));
		await insertRoom(db, "room-b1", HOTEL_B, "Standard");
		await insertFacilityLink(db, HOTEL_B, "pool");
		await insertImage(db, HOTEL_B, "https://img.example/b-1.jpg");
		await insertRule(db, "rule-b-hotel", HOTEL_B, null, "Nhận phòng sau 14:00");

		// Sanity check before the delete: hotel A has the rows we expect to disappear.
		expect(await countWhere(db, "rooms", "hotel_id = ?", [HOTEL_A])).toBe(2);
		expect(await countWhere(db, "hotel_facilities", "hotel_id = ?", [HOTEL_A])).toBe(2);
		expect(await countWhere(db, "hotel_images", "hotel_id = ?", [HOTEL_A])).toBe(2);
		expect(await countWhere(db, "booking_rules", "hotel_id = ?", [HOTEL_A])).toBe(2);

		// Step 4 (expected 4): delete hotel A. Must succeed, not be blocked by a foreign key.
		await expect(run(db, `DELETE FROM hotels WHERE id = ?`, [HOTEL_A])).resolves.toBeUndefined();
		expect(await countWhere(db, "hotels", "id = ?", [HOTEL_A])).toBe(0);

		// Step 5 (expected 5): counts for hotel A, hotel B, and the shared tables.
		expect(await countWhere(db, "rooms", "hotel_id = ?", [HOTEL_A]), "hotel A rooms").toBe(0);
		expect(await countWhere(db, "hotel_facilities", "hotel_id = ?", [HOTEL_A]), "hotel A facility links").toBe(0);
		expect(await countWhere(db, "hotel_images", "hotel_id = ?", [HOTEL_A]), "hotel A images").toBe(0);
		expect(await countWhere(db, "booking_rules", "hotel_id = ?", [HOTEL_A]), "hotel A rules").toBe(0);

		expect(await countWhere(db, "rooms", "hotel_id = ?", [HOTEL_B]), "hotel B rooms").toBe(1);
		expect(await countWhere(db, "hotel_facilities", "hotel_id = ?", [HOTEL_B]), "hotel B facility links").toBe(1);
		expect(await countWhere(db, "hotel_images", "hotel_id = ?", [HOTEL_B]), "hotel B images").toBe(1);
		expect(await countWhere(db, "booking_rules", "hotel_id = ?", [HOTEL_B]), "hotel B rules").toBe(1);
		expect(await countWhere(db, "hotels", "id = ?", [HOTEL_B]), "hotel B row").toBe(1);

		expect(await countAll(db, "cities"), "cities row remains").toBe(1);
		expect(await countAll(db, "facility_catalog"), "facility_catalog rows remain").toBe(2);

		// Step 6 (expected 6): add a room-level rule to hotel B's room, delete that room, then count its rules.
		await insertRule(db, "rule-b-room", HOTEL_B, "room-b1", "Phòng Standard không hút thuốc");
		expect(await countWhere(db, "booking_rules", "room_id = ?", ["room-b1"]), "room-level rule before delete").toBe(1);

		await expect(run(db, `DELETE FROM rooms WHERE id = ?`, ["room-b1"])).resolves.toBeUndefined();

		expect(await countWhere(db, "rooms", "id = ?", ["room-b1"]), "deleted room gone").toBe(0);
		expect(await countWhere(db, "booking_rules", "id = ?", ["rule-b-room"]), "room-level rule of deleted room gone").toBe(0);
		expect(await countWhere(db, "booking_rules", "id = ?", ["rule-b-hotel"]), "hotel B hotel-level rule remains").toBe(1);
		expect(await countWhere(db, "hotels", "id = ?", [HOTEL_B]), "hotel B still exists").toBe(1);
	});
});
