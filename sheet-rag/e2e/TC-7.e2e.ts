// TC-7: Room price is a whole number of VND, and may be empty (STORY-13, AC8).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const CITY = { slug: "da-nang", name_vi: "Da Nang", name_en: "Da Nang" };
const HOTEL_ID = "hotel-price-1";

// The CHECK constraint on rooms.base_price rejects these. The exact wording is not pinned, only that it is a constraint error.
const CONSTRAINT_ERROR = /constraint failed/i;

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

interface PriceRow {
	id: string;
	base_price: unknown;
	price_type: string;
}

async function roomCount(db: FakeD1): Promise<number> {
	const row = await db.prepare("SELECT COUNT(*) AS n FROM rooms").first<{ n: number }>();
	return row === null || row === undefined ? -1 : Number(row.n);
}

async function insertRoom(db: FakeD1, id: string, basePrice?: number | string | null): Promise<unknown> {
	// When basePrice is undefined the column is omitted from the INSERT entirely.
	if (basePrice === undefined) {
		return db
			.prepare("INSERT INTO rooms (id, hotel_id, name, name_search, source) VALUES (?, ?, ?, ?, ?)")
			.bind(id, HOTEL_ID, `Room ${id}`, `room ${id}`, "sheet")
			.run();
	}
	return db
		.prepare(
			"INSERT INTO rooms (id, hotel_id, name, name_search, source, base_price) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.bind(id, HOTEL_ID, `Room ${id}`, `room ${id}`, "sheet", basePrice)
		.run();
}

async function readPrices(db: FakeD1): Promise<PriceRow[]> {
	const { results } = await db
		.prepare(
			"SELECT id, base_price, typeof(base_price) AS price_type FROM rooms ORDER BY id",
		)
		.all<PriceRow>();
	return results;
}

test.describe("TC-7: room price is a whole number of VND, and may be empty", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("whole-number prices and NULL are stored, fractional, text and negative prices are rejected", async () => {
		// Preconditions: fresh database, migrations applied, a city and a hotel.
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
			.bind(HOTEL_ID, "hotel-price", CITY.slug, "Hotel Price", "hotel price", "file-price", "1", "hash-price", "2026-11-18T10:00:00Z")
			.run();

		// Step 1: a room with a whole-number price succeeds.
		await expect(insertRoom(db, "room-price-1", 1250000), "whole-number price must be accepted").resolves.toBeDefined();

		// Step 2: zero is a whole number and is not negative, so it succeeds.
		await expect(insertRoom(db, "room-price-2", 0), "zero price must be accepted").resolves.toBeDefined();

		// Step 3: a room with no price (column omitted) and a room with explicit NULL both succeed.
		await expect(insertRoom(db, "room-price-3"), "room with omitted price must be accepted").resolves.toBeDefined();
		await expect(insertRoom(db, "room-price-4", null), "room with explicit NULL price must be accepted").resolves.toBeDefined();

		const countAfterValid = await roomCount(db);
		expect(countAfterValid).toBe(4);

		// Step 4: fractional, text and negative prices are each rejected by the CHECK constraint.
		const invalidPrices: Array<{ id: string; price: number | string }> = [
			{ id: "room-bad-fraction", price: 1250000.5 },
			{ id: "room-bad-text", price: "abc" },
			{ id: "room-bad-negative", price: -1000 },
		];
		for (const { id, price } of invalidPrices) {
			await expect(
				insertRoom(db, id, price),
				`insert with base_price ${JSON.stringify(price)} must be rejected`,
			).rejects.toThrow(CONSTRAINT_ERROR);
		}
		expect(await roomCount(db), "rejected inserts must not add rows").toBe(countAfterValid);

		// Step 5: updating an existing room to a fractional price is rejected, and the old price stays.
		await expect(
			db
				.prepare("UPDATE rooms SET base_price = ? WHERE id = ?")
				.bind(999.9, "room-price-1")
				.run(),
			"update to base_price 999.9 must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);

		// Step 6: read all prices. Exactly 1250000, 0, NULL, NULL, and each non-null value is an SQLite integer.
		const rows = await readPrices(db);
		expect(rows.map((row) => row.id)).toEqual(["room-price-1", "room-price-2", "room-price-3", "room-price-4"]);
		expect(rows.map((row) => row.base_price)).toEqual([1250000, 0, null, null]);
		for (const row of rows) {
			if (row.base_price === null) {
				expect(row.price_type, `room ${row.id} with no price must store NULL`).toBe("null");
			} else {
				expect(row.price_type, `room ${row.id} price must be stored as an integer`).toBe("integer");
			}
		}
		expect(await roomCount(db), "no rows added or removed by the rejected statements").toBe(4);
	});
});
