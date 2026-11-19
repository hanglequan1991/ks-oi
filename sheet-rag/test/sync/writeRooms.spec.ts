import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { buildRoomStatements } from "../../src/sync/writeRooms";
import { sha256Hex } from "../../src/sync/hash";
import type { ParsedHotel, ParsedRoom } from "../../src/sync/record";
import { foldText } from "../../src/domain/fold";

const HOTEL_ID = "0123456789abcdef";
const NOW = "2026-11-19T02:00:00.000Z";

function room(name: string, basePrice: number | null, rules: string[] = []): ParsedRoom {
	return { name, basePrice, rules };
}

function hotel(overrides: Partial<ParsedHotel> = {}): ParsedHotel {
	return {
		stars: 3,
		address: null,
		area: null,
		descriptionVi: null,
		descriptionEn: null,
		images: [],
		facilities: [],
		rooms: [],
		hotelRules: [],
		...overrides,
	};
}

async function roomId(name: string): Promise<string> {
	return (await sha256Hex(`${HOTEL_ID}:${foldText(name)}`)).slice(0, 16);
}

async function write(db: FakeD1, record: ParsedHotel, now: string = NOW): Promise<void> {
	const statements = await buildRoomStatements(
		db as unknown as D1Database,
		{ hotelId: HOTEL_ID, record, now },
	);
	await db.batch(statements as unknown as Parameters<FakeD1["batch"]>[0]);
}

async function rows(db: FakeD1, sql: string): Promise<Record<string, unknown>[]> {
	const res = await db.prepare(sql).all();
	return res.results;
}

describe("buildRoomStatements", () => {
	let db: FakeD1;

	beforeEach(async () => {
		db = createFakeD1();
		await applyMigrations(db);
		await db.exec("INSERT INTO cities (slug, name_vi) VALUES ('hanoi', 'Hà Nội')");
		await db
			.prepare(
				`INSERT INTO hotels (id, slug, city_slug, name, name_search, source_file_id, source_gid, source_hash, synced_at)
				 VALUES (?, 'hotel-a', 'hanoi', 'Hotel A', 'hotel a', 'file1', '0', 'hash1', ?)`,
			)
			.bind(HOTEL_ID, NOW)
			.run();
	});

	it("rooms inserted with base price and null price kept null", async () => {
		await write(
			db,
			hotel({ rooms: [room("Deluxe", 1500000), room("Standard", null)] }),
		);

		const got = await rows(db, "SELECT name, base_price, source FROM rooms ORDER BY name");
		expect(got).toEqual([
			{ name: "Deluxe", base_price: 1500000, source: "sheet" },
			{ name: "Standard", base_price: null, source: "sheet" },
		]);
	});

	it("room ids are stable across runs and sheet order is position", async () => {
		await write(db, hotel({ rooms: [room("Deluxe", 1000000), room("Standard", 500000)] }));
		const first = await rows(db, "SELECT id, name, position FROM rooms ORDER BY position");
		expect(first).toEqual([
			{ id: await roomId("Deluxe"), name: "Deluxe", position: 0 },
			{ id: await roomId("Standard"), name: "Standard", position: 1 },
		]);

		// Same rooms, reversed order, new price: ids stay, positions follow the sheet.
		await write(db, hotel({ rooms: [room("Standard", 600000), room("Deluxe", 1200000)] }));
		const second = await rows(
			db,
			"SELECT id, name, position, base_price FROM rooms ORDER BY position",
		);
		expect(second).toEqual([
			{ id: await roomId("Standard"), name: "Standard", position: 0, base_price: 600000 },
			{ id: await roomId("Deluxe"), name: "Deluxe", position: 1, base_price: 1200000 },
		]);
	});

	it("removed sheet room deleted, mytour room kept", async () => {
		await write(
			db,
			hotel({
				rooms: [room("Deluxe", 1000000), room("Old", 400000, ["Không hoàn tiền"])],
			}),
		);
		// A Mytour room that the sheet never mentions.
		await db
			.prepare(
				`INSERT INTO rooms (id, hotel_id, name, name_search, base_price, source, position)
				 VALUES ('mytour-room-1', ?, 'Mytour Suite', 'mytour suite', 2000000, 'mytour', 5)`,
			)
			.bind(HOTEL_ID)
			.run();

		const before = await rows(db, "SELECT id FROM booking_rules WHERE room_id IS NOT NULL");
		expect(before).toHaveLength(1);

		// "Old" disappears from the sheet.
		await write(db, hotel({ rooms: [room("Deluxe", 1000000)] }));

		const names = await rows(db, "SELECT name, source FROM rooms ORDER BY name");
		expect(names).toEqual([
			{ name: "Deluxe", source: "sheet" },
			{ name: "Mytour Suite", source: "mytour" },
		]);
		// The room-level rule of the deleted room cascades away.
		const oldRules = await db
			.prepare("SELECT id FROM booking_rules WHERE room_id = ?")
			.bind(await roomId("Old"))
			.all();
		expect(oldRules.results).toEqual([]);
		const hotelLevel = await rows(db, "SELECT id FROM booking_rules WHERE room_id IS NULL");
		expect(hotelLevel).toEqual([]);
	});

	it("hotel and room level rules attached correctly with synced_at", async () => {
		await write(
			db,
			hotel({
				hotelRules: ["Check-in 14:00"],
				rooms: [room("Deluxe", 1000000, ["No pets", "Breakfast included"])],
			}),
		);

		const got = await rows(
			db,
			"SELECT id, hotel_id, room_id, raw_text, synced_at, status, checkin_time, checkout_time, cancellation, deposit, children_policy, pets, smoking, id_required, payment_methods, min_stay, surcharges FROM booking_rules ORDER BY id",
		);
		expect(got).toHaveLength(3);
		const deluxeId = await roomId("Deluxe");
		const hotelRule = await sha256Hex(`${HOTEL_ID}:hotel:0`);
		const roomRule0 = await sha256Hex(`${HOTEL_ID}:${deluxeId}:0`);
		const roomRule1 = await sha256Hex(`${HOTEL_ID}:${deluxeId}:1`);

		const byId = new Map(got.map((r) => [r.id as string, r]));
		expect(byId.get(hotelRule.slice(0, 16))).toMatchObject({
			hotel_id: HOTEL_ID,
			room_id: null,
			raw_text: "Check-in 14:00",
			synced_at: NOW,
			status: "review",
		});
		expect(byId.get(roomRule0.slice(0, 16))).toMatchObject({
			room_id: deluxeId,
			raw_text: "No pets",
			synced_at: NOW,
			status: "review",
		});
		expect(byId.get(roomRule1.slice(0, 16))).toMatchObject({
			room_id: deluxeId,
			raw_text: "Breakfast included",
		});
		for (const r of got) {
			for (const col of [
				"checkin_time", "checkout_time", "cancellation", "deposit", "children_policy",
				"pets", "smoking", "id_required", "payment_methods", "min_stay", "surcharges",
			]) {
				expect(r[col]).toBeNull();
			}
		}
	});

	it("rule text is stored verbatim including newlines and Vietnamese", async () => {
		const texts = [
			"  Hủy phòng trước 48h: hoàn 50%  ",
			'Trẻ em "dưới 6 tuổi" miễn phí 🎉\nNgười lớn thêm 200.000đ',
			"Line one\r\nLine two\n",
		];
		await write(db, hotel({ hotelRules: texts }));

		const got = await rows(db, "SELECT raw_text FROM booking_rules ORDER BY id");
		expect(got.map((r) => r.raw_text).sort()).toEqual([...texts].sort());
	});

	it("second identical run leaves tables identical", async () => {
		const record = hotel({
			hotelRules: ["Check-in 14:00", "Hủy phòng 🎉"],
			rooms: [room("Deluxe", 1000000, ["No pets"]), room("Standard", null)],
		});
		const snapshot = () =>
			Promise.all([
				rows(db, "SELECT * FROM rooms ORDER BY id"),
				rows(db, "SELECT * FROM booking_rules ORDER BY id"),
			]);

		await write(db, record);
		const first = await snapshot();
		await write(db, record);
		const second = await snapshot();

		expect(second).toEqual(first);
		expect(first[1]).toHaveLength(3);
		expect(first[1].every((r) => r.synced_at === NOW)).toBe(true);
	});
});
