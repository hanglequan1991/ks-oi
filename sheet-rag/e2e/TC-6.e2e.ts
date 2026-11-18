// TC-6: Booking rules at hotel level and room level keep original text and sync date (STORY-13, AC7).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const CITY = { slug: "da-nang", name_vi: "Da Nang", name_en: "Da Nang" };
const HOTEL_ID = "hotel-rules-1";
const ROOM_ID = "room-rules-1";

// Verbatim text from the sheet: leading and trailing spaces, a newline, and Vietnamese diacritics.
const RAW_TEXT = "  Huy phòng trước 3 ngày.\nKhông hoàn tiền nếu đến muộn.  ";
const SYNCED_AT = "2026-11-18T10:00:00Z";
const ROOM_RULE_TEXT = "Phòng Deluxe: đặt cọc 50% khi xác nhận.";
const ROOM_RULE_SYNCED_AT = "2026-11-18T11:30:00Z";

// A NOT NULL or FOREIGN KEY violation from SQLite. The exact wording is not pinned, only that it is a constraint error.
const CONSTRAINT_ERROR = /constraint failed/i;

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

interface RuleRow {
	id: string;
	hotel_id: string;
	room_id: string | null;
	raw_text: string;
	synced_at: string;
}

async function ruleCount(db: FakeD1): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) AS n FROM booking_rules")
		.first<{ n: number }>();
	return row === null || row === undefined ? -1 : Number(row.n);
}

async function readRule(db: FakeD1, id: string): Promise<RuleRow | null> {
	return db
		.prepare("SELECT id, hotel_id, room_id, raw_text, synced_at FROM booking_rules WHERE id = ?")
		.bind(id)
		.first<RuleRow>();
}

test.describe("TC-6: booking rules at hotel level and room level keep original text and sync date", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("rules keep verbatim text and sync date, and invalid rules are rejected", async () => {
		// Preconditions: fresh database, migrations applied, a city, a hotel and a room.
		const db = createFakeD1();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();
		await db
			.prepare("INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)")
			.bind(CITY.slug, CITY.name_vi, CITY.name_en)
			.run();
		await db
			.prepare(
				"INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.bind(HOTEL_ID, "hotel-rules", CITY.slug, "Hotel Rules", "hotel rules", "file-rules", "1", "hash-rules", SYNCED_AT)
			.run();
		await db
			.prepare("INSERT INTO rooms (id, hotel_id, name, name_search, source) VALUES (?, ?, ?, ?, ?)")
			.bind(ROOM_ID, HOTEL_ID, "Deluxe", "deluxe", "sheet")
			.run();

		// Step 1: hotel-level rule (room_id NULL) with verbatim text and a sync date.
		await expect(
			db
				.prepare(
					"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, NULL, ?, ?)",
				)
				.bind("rule-hotel-1", HOTEL_ID, RAW_TEXT, SYNCED_AT)
				.run(),
			"hotel-level insert must succeed",
		).resolves.toBeDefined();

		// Step 2: room-level rule with its own text and sync date.
		await expect(
			db
				.prepare(
					"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, ?, ?, ?)",
				)
				.bind("rule-room-1", HOTEL_ID, ROOM_ID, ROOM_RULE_TEXT, ROOM_RULE_SYNCED_AT)
				.run(),
			"room-level insert must succeed",
		).resolves.toBeDefined();

		// Step 3: read both rules back.
		const hotelRule = await readRule(db, "rule-hotel-1");
		expect(hotelRule, "hotel-level rule must be readable").not.toBeNull();
		if (hotelRule === null) return;
		expect(hotelRule.room_id, "hotel-level rule must have room_id NULL").toBeNull();
		expect(hotelRule.hotel_id).toBe(HOTEL_ID);
		expect(hotelRule.raw_text, "hotel-level raw_text must be identical to the inserted text").toBe(RAW_TEXT);
		expect(
			Buffer.from(hotelRule.raw_text, "utf8").equals(Buffer.from(RAW_TEXT, "utf8")),
			"hotel-level raw_text must match byte for byte",
		).toBe(true);
		expect(hotelRule.synced_at, "hotel-level synced_at must be the value given").toBe(SYNCED_AT);

		const roomRule = await readRule(db, "rule-room-1");
		expect(roomRule, "room-level rule must be readable").not.toBeNull();
		if (roomRule === null) return;
		expect(roomRule.room_id, "room-level rule must have the room id").toBe(ROOM_ID);
		expect(roomRule.raw_text).toBe(ROOM_RULE_TEXT);
		expect(roomRule.synced_at, "room-level synced_at must be the value given").toBe(ROOM_RULE_SYNCED_AT);

		const rulesBefore = await ruleCount(db);
		expect(rulesBefore).toBe(2);

		// Step 4: insert without raw_text is rejected (NOT NULL).
		await expect(
			db
				.prepare("INSERT INTO booking_rules (id, hotel_id, room_id, synced_at) VALUES (?, ?, NULL, ?)")
				.bind("rule-no-text", HOTEL_ID, SYNCED_AT)
				.run(),
			"insert without raw_text must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);

		// Step 5: insert without synced_at is rejected (NOT NULL).
		await expect(
			db
				.prepare("INSERT INTO booking_rules (id, hotel_id, room_id, raw_text) VALUES (?, ?, NULL, ?)")
				.bind("rule-no-sync", HOTEL_ID, RAW_TEXT)
				.run(),
			"insert without synced_at must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);

		// Step 6: insert with a room_id that does not exist is rejected (foreign key).
		// room_id is TEXT, so the id is bound as a string.
		await expect(
			db
				.prepare(
					"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, ?, ?, ?)",
				)
				.bind("rule-bad-room", HOTEL_ID, "99999", RAW_TEXT, SYNCED_AT)
				.run(),
			"insert with unknown room_id must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);

		// Step 7: insert with a hotel_id that does not exist is rejected (foreign key).
		await expect(
			db
				.prepare(
					"INSERT INTO booking_rules (id, hotel_id, room_id, raw_text, synced_at) VALUES (?, ?, NULL, ?, ?)",
				)
				.bind("rule-bad-hotel", "no-such-hotel", RAW_TEXT, SYNCED_AT)
				.run(),
			"insert with unknown hotel_id must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);

		// The rejected inserts must not have added rows.
		expect(await ruleCount(db), "rejected inserts must not add rows").toBe(rulesBefore);
	});
});
