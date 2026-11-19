import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import {
	buildDataVersionStatement,
	buildOverrideStatements,
} from "../../src/sync/overrides";

const HOTEL_ID = "0123456789abcdef";
const ROOM_A = "room-a-0000000a";
const ROOM_B = "room-b-0000000b";

type Statement = Parameters<FakeD1["batch"]>[0][number];

/** Simulates a sheet write: sets the sheet-owned columns of the hotel and its rooms. */
async function sheetWrite(
	db: FakeD1,
	values: { description: string; stars: number; roomPrice: number },
): Promise<void> {
	await db
		.prepare(
			"UPDATE hotels SET description_vi = ?, description_en = ?, address = ?, area = ?, stars = ?, status = 'review', name = 'Sheet name' WHERE id = ?",
		)
		.bind(values.description, "sheet en", "sheet address", "sheet area", values.stars, HOTEL_ID)
		.run();
	await db
		.prepare("UPDATE rooms SET description = ?, base_price = ? WHERE hotel_id = ? AND source = 'sheet'")
		.bind("sheet room text", values.roomPrice, HOTEL_ID)
		.run();
}

async function applyOverrides(db: FakeD1, hotelId: string = HOTEL_ID): Promise<void> {
	const statements = buildOverrideStatements(db as unknown as D1Database, hotelId);
	await db.batch(statements as unknown as Statement[]);
}

async function applyDataVersion(db: FakeD1): Promise<void> {
	const statement = buildDataVersionStatement(db as unknown as D1Database);
	await db.batch([statement as unknown as Statement]);
}

async function one(db: FakeD1, sql: string, ...params: unknown[]): Promise<Record<string, unknown>> {
	const row = await db.prepare(sql).bind(...params).first<Record<string, unknown>>();
	if (!row) throw new Error(`no row for: ${sql}`);
	return row;
}

async function insertOverride(
	db: FakeD1,
	entity: string,
	entityId: string,
	field: string,
	value: string,
): Promise<void> {
	await db
		.prepare(
			"INSERT INTO overrides (hotel_id, entity, entity_id, field, value, set_by, set_at) VALUES (?, ?, ?, ?, ?, 'owner', '2026-11-19T00:00:00Z')",
		)
		.bind(HOTEL_ID, entity, entityId, field, value)
		.run();
}

describe("buildOverrideStatements", () => {
	let db: FakeD1;

	beforeEach(async () => {
		db = createFakeD1();
		await applyMigrations(db);
		await db.exec("INSERT INTO cities (slug, name_vi) VALUES ('hanoi', 'Hà Nội')");
		await db
			.prepare(
				`INSERT INTO hotels (id, slug, city_slug, name, name_search, stars, address, area, description_vi, description_en, status, source_file_id, source_gid, source_hash, synced_at)
				 VALUES (?, 'hotel-a', 'hanoi', 'Hotel A', 'hotel a', 3, 'sheet address', 'sheet area', 'sheet vi', 'sheet en', 'review', 'file1', '0', 'hash1', '2026-11-19T00:00:00Z')`,
			)
			.bind(HOTEL_ID)
			.run();
		await db
			.prepare(
				`INSERT INTO rooms (id, hotel_id, name, name_search, description, base_price, source, position)
				 VALUES (?, ?, 'Deluxe', 'deluxe', 'sheet room text', 1000000, 'sheet', 0),
				        (?, ?, 'Standard', 'standard', 'sheet room text', 500000, 'sheet', 1)`,
			)
			.bind(ROOM_A, HOTEL_ID, ROOM_B, HOTEL_ID)
			.run();
	});

	it("description override wins over the sheet value", async () => {
		await insertOverride(db, "hotel", "", "description_vi", "owner vi");
		await sheetWrite(db, { description: "sheet vi v2", stars: 3, roomPrice: 1000000 });

		await applyOverrides(db);

		const hotel = await one(db, "SELECT description_vi FROM hotels WHERE id = ?", HOTEL_ID);
		expect(hotel.description_vi).toBe("owner vi");
	});

	it("room base_price override applies, bad cast skipped", async () => {
		await insertOverride(db, "room", ROOM_A, "base_price", "1200000");
		await insertOverride(db, "room", ROOM_B, "base_price", "about 500k");
		await insertOverride(db, "hotel", "", "stars", "four");

		await applyOverrides(db);

		const a = await one(db, "SELECT base_price, typeof(base_price) AS t FROM rooms WHERE id = ?", ROOM_A);
		expect(a).toEqual({ base_price: 1200000, t: "integer" });
		const b = await one(db, "SELECT base_price FROM rooms WHERE id = ?", ROOM_B);
		expect(b.base_price).toBe(500000);
		const hotel = await one(db, "SELECT stars FROM hotels WHERE id = ?", HOTEL_ID);
		expect(hotel.stars).toBe(3);
	});

	it("stars override applies when it casts to 1 to 5", async () => {
		await insertOverride(db, "hotel", "", "stars", "5");

		await applyOverrides(db);

		const hotel = await one(db, "SELECT stars, typeof(stars) AS t FROM hotels WHERE id = ?", HOTEL_ID);
		expect(hotel).toEqual({ stars: 5, t: "integer" });
	});

	it("non-whitelisted field and invalid status ignored", async () => {
		await insertOverride(db, "hotel", "", "name", "Hacked name");
		await insertOverride(db, "hotel", "", "source_hash", "forged");
		await insertOverride(db, "hotel", "", "status", "banana");
		await insertOverride(db, "room", ROOM_A, "name", "Hacked room");
		await insertOverride(db, "room", ROOM_A, "description", "owner room text");

		await applyOverrides(db);

		const hotel = await one(db, "SELECT name, source_hash, status FROM hotels WHERE id = ?", HOTEL_ID);
		expect(hotel).toEqual({ name: "Hotel A", source_hash: "hash1", status: "review" });
		const room = await one(db, "SELECT name, description FROM rooms WHERE id = ?", ROOM_A);
		expect(room).toEqual({ name: "Deluxe", description: "owner room text" });
	});

	it("status override applies when review, published or hidden", async () => {
		await insertOverride(db, "hotel", "", "status", "hidden");

		await applyOverrides(db);

		const hotel = await one(db, "SELECT status FROM hotels WHERE id = ?", HOTEL_ID);
		expect(hotel.status).toBe("hidden");
	});

	it("override for a missing room does nothing", async () => {
		await insertOverride(db, "room", "no-such-room", "base_price", "999");
		await insertOverride(db, "room", "no-such-room", "description", "ghost");

		await expect(applyOverrides(db)).resolves.toBeUndefined();

		const count = await one(db, "SELECT COUNT(*) AS n FROM rooms WHERE hotel_id = ?", HOTEL_ID);
		expect(count.n).toBe(2);
		const a = await one(db, "SELECT base_price, description FROM rooms WHERE id = ?", ROOM_A);
		expect(a).toEqual({ base_price: 1000000, description: "sheet room text" });
	});

	it("override survives a sheet write and running twice is idempotent", async () => {
		await insertOverride(db, "hotel", "", "address", "owner address");
		await insertOverride(db, "room", ROOM_A, "base_price", "1200000");

		await sheetWrite(db, { description: "sheet vi v2", stars: 4, roomPrice: 1000000 });
		await applyOverrides(db);
		const first = await one(db, "SELECT address, stars FROM hotels WHERE id = ?", HOTEL_ID);
		const firstRoom = await one(db, "SELECT base_price FROM rooms WHERE id = ?", ROOM_A);

		await applyOverrides(db);
		const second = await one(db, "SELECT address, stars FROM hotels WHERE id = ?", HOTEL_ID);
		const secondRoom = await one(db, "SELECT base_price FROM rooms WHERE id = ?", ROOM_A);

		expect(first).toEqual({ address: "owner address", stars: 4 });
		expect(second).toEqual(first);
		expect(firstRoom.base_price).toBe(1200000);
		expect(secondRoom).toEqual(firstRoom);
	});

	it("only overrides of the given hotel are applied", async () => {
		await db
			.prepare(
				`INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at)
				 VALUES ('other-hotel-000001', 'hotel-b', 'hanoi', 'Hotel B', 'hotel b', 'file2', '0', 'hash2', '2026-11-19T00:00:00Z')`,
			)
			.run();
		await db
			.prepare(
				"INSERT INTO overrides (hotel_id, entity, entity_id, field, value, set_at) VALUES ('other-hotel-000001', 'hotel', '', 'area', 'other area', '2026-11-19T00:00:00Z')",
			)
			.run();

		await applyOverrides(db);

		const other = await one(db, "SELECT area FROM hotels WHERE id = 'other-hotel-000001'");
		expect(other.area).toBeNull();
	});
});

describe("buildDataVersionStatement", () => {
	let db: FakeD1;

	beforeEach(async () => {
		db = createFakeD1();
		await applyMigrations(db);
	});

	async function dataVersion(): Promise<unknown> {
		const row = await one(db, "SELECT value FROM settings WHERE key = 'data_version'");
		return row.value;
	}

	it("data_version increments, creates and repairs", async () => {
		// Seeded at 1 by migration 0002.
		await applyDataVersion(db);
		expect(await dataVersion()).toBe("2");

		await db.prepare("UPDATE settings SET value = '7' WHERE key = 'data_version'").run();
		await applyDataVersion(db);
		expect(await dataVersion()).toBe("8");

		await db.prepare("DELETE FROM settings WHERE key = 'data_version'").run();
		await applyDataVersion(db);
		expect(await dataVersion()).toBe("1");

		await db.prepare("UPDATE settings SET value = 'abc' WHERE key = 'data_version'").run();
		await applyDataVersion(db);
		expect(await dataVersion()).toBe("1");
	});
});
