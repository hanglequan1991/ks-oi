// TC-2: Migrations are safe to run again (no duplicates, no data loss) (STORY-13, AC2).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const SETTINGS_KEYS = [
	"service_fee_percent",
	"show_fee_note",
	"disclaimer_vi",
	"disclaimer_en",
	"data_version",
	"sync_auto_publish",
];

const CITY = { slug: "da-nang", name_vi: "Da Nang", name_en: "Da Nang" };
const HOTEL_ID = "a1b2c3d4e5f60718";
const HOTEL = {
	id: HOTEL_ID,
	slug: "hotel-test",
	city_slug: CITY.slug,
	name: "Hotel Test",
	name_search: "hotel test",
	source_file_id: "file-test",
	source_gid: "0",
	source_hash: "hash-test",
	synced_at: "2026-11-18T00:00:00Z",
};
const ROOM_ID = "room-deluxe-1";
const ROOM = { id: ROOM_ID, hotel_id: HOTEL_ID, name: "Deluxe", name_search: "deluxe", base_price: 1250000, source: "sheet" };
const RULE_ID = "rule-hotel-1";
const RULE_TEXT = "Huy trước 3 ngày";
const FACILITY = { code: "pool", category: "facility", label_vi: "Hồ bơi", label_en: "Pool" };

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

async function userTables(db: FakeD1): Promise<string[]> {
	const { results } = await db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
		.all<{ name: string }>();
	return results.map((row) => row.name);
}

// Full contents of every user table, in insertion order. Comparing two snapshots checks row counts and field values.
async function snapshot(db: FakeD1): Promise<Record<string, Record<string, unknown>[]>> {
	const result: Record<string, Record<string, unknown>[]> = {};
	for (const table of await userTables(db)) {
		const { results } = await db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
		result[table] = results;
	}
	return result;
}

async function countRows(db: FakeD1, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).first<{ n: number }>();
	return Number(row?.n ?? 0);
}

async function settingsRows(db: FakeD1): Promise<{ key: string; value: string }[]> {
	const { results } = await db
		.prepare("SELECT key, value FROM settings ORDER BY key")
		.all<{ key: string; value: string }>();
	return results;
}

test.describe("TC-2: migrations are safe to run again", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("re-running migrations keeps counts, settings and inserted data unchanged", async () => {
		const db = createFakeD1();

		// Step 1: first run of the migrations on a fresh database.
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 2: insert a city, a hotel, a room, a hotel-level booking rule and a facility link.
		// The facility link needs its catalog entry first (foreign key to facility_catalog).
		await expect(
			db
				.prepare("INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)")
				.bind(CITY.slug, CITY.name_vi, CITY.name_en)
				.run(),
		).resolves.toMatchObject({ success: true });
		await expect(
			db
				.prepare(
					"INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				)
				.bind(
					HOTEL.id,
					HOTEL.slug,
					HOTEL.city_slug,
					HOTEL.name,
					HOTEL.name_search,
					HOTEL.source_file_id,
					HOTEL.source_gid,
					HOTEL.source_hash,
					HOTEL.synced_at,
				)
				.run(),
		).resolves.toMatchObject({ success: true });
		await expect(
			db
				.prepare(
					"INSERT INTO rooms (id, hotel_id, name, name_search, base_price, source) VALUES (?, ?, ?, ?, ?, ?)",
				)
				.bind(ROOM.id, ROOM.hotel_id, ROOM.name, ROOM.name_search, ROOM.base_price, ROOM.source)
				.run(),
		).resolves.toMatchObject({ success: true });
		await expect(
			db
				.prepare(
					"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, NULL, ?, ?)",
				)
				.bind(RULE_ID, HOTEL_ID, RULE_TEXT, HOTEL.synced_at)
				.run(),
		).resolves.toMatchObject({ success: true });
		await expect(
			db
				.prepare(
					"INSERT INTO facility_catalog (code, category, label_vi, label_en) VALUES (?, ?, ?, ?)",
				)
				.bind(FACILITY.code, FACILITY.category, FACILITY.label_vi, FACILITY.label_en)
				.run(),
		).resolves.toMatchObject({ success: true });
		await expect(
			db
				.prepare("INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES (?, ?, 'sheet', 1)")
				.bind(HOTEL_ID, FACILITY.code)
				.run(),
		).resolves.toMatchObject({ success: true });

		// Step 3: record row counts of every table and the full contents of settings.
		const tables = await userTables(db);
		expect(tables.length).toBeGreaterThan(0);
		const countsBefore = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await countRows(db, t)])));
		const settingsBefore = await settingsRows(db);
		expect(settingsBefore.map((row) => row.key)).toEqual([...SETTINGS_KEYS].sort());
		expect(settingsBefore).toHaveLength(6);
		const snapshotBefore = await snapshot(db);

		// Step 4: run the migrations a second time, then a third time.
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 5: re-read row counts, settings and the inserted rows.
		const countsAfter = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await countRows(db, t)])));
		expect(countsAfter, "row counts of all tables must be unchanged").toEqual(countsBefore);

		const settingsAfter = await settingsRows(db);
		expect(settingsAfter, "settings must keep exactly one row per key").toHaveLength(6);
		expect(settingsAfter).toEqual(settingsBefore);

		const cityRow = await db.prepare("SELECT * FROM cities WHERE slug = ?").bind(CITY.slug).first();
		expect(cityRow).toEqual(CITY);

		const hotelRow = await db.prepare("SELECT id, slug, city_slug, name FROM hotels WHERE id = ?").bind(HOTEL_ID).first();
		expect(hotelRow).toEqual({ id: HOTEL.id, slug: HOTEL.slug, city_slug: HOTEL.city_slug, name: HOTEL.name });

		const roomRow = await db
			.prepare("SELECT id, hotel_id, name, base_price, source FROM rooms WHERE id = ?")
			.bind(ROOM_ID)
			.first();
		expect(roomRow).toEqual({
			id: ROOM.id,
			hotel_id: ROOM.hotel_id,
			name: ROOM.name,
			base_price: 1250000,
			source: ROOM.source,
		});

		const ruleRow = await db.prepare("SELECT id, hotel_id, room_id, raw_text FROM booking_rules WHERE id = ?").bind(RULE_ID).first();
		expect(ruleRow).toEqual({ id: RULE_ID, hotel_id: HOTEL_ID, room_id: null, raw_text: RULE_TEXT });

		const facilityRow = await db
			.prepare("SELECT hotel_id, code, source, confirmed FROM hotel_facilities WHERE hotel_id = ? AND code = ?")
			.bind(HOTEL_ID, FACILITY.code)
			.first();
		expect(facilityRow).toEqual({ hotel_id: HOTEL_ID, code: FACILITY.code, source: "sheet", confirmed: 1 });

		// Field for field: every table is unchanged compared with the snapshot taken before the re-runs.
		expect(await snapshot(db)).toEqual(snapshotBefore);
	});
});
