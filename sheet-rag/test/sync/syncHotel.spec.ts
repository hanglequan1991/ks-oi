import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { syncHotel } from "../../src/sync/syncHotel";
import { hotelIdFor } from "../../src/sync/hash";
import type { ParsedHotel, ParsedRoom } from "../../src/sync/record";
import type { SheetTab } from "../../src/sync/sheetSource";

const NOW = "2026-11-19T10:00:00Z";
const LATER = "2026-11-19T11:00:00Z";
const HASH_1 = "hash-1";
const HASH_2 = "hash-2";

const tab: SheetTab = {
	fileId: "file-1",
	fileName: "Đà Nẵng",
	gid: "42",
	tabName: "Khách sạn Biển Xanh",
};

function room(name: string, basePrice: number | null, rules: string[] = []): ParsedRoom {
	return { name, basePrice, rules, bedType: "King", sizeM2: 25, maxGuests: 2, description: `${name} desc` };
}

function hotel(overrides: Partial<ParsedHotel> = {}): ParsedHotel {
	return {
		stars: 4,
		address: "12 Lê Lợi",
		area: "Hải Châu",
		descriptionVi: "Mô tả tiếng Việt",
		descriptionEn: "English description",
		images: ["https://img.example/a.jpg", "https://img.example/b.jpg", "https://img.example/a.jpg"],
		facilities: ["Hồ bơi", "Bãi đỗ xe"],
		rooms: [room("Deluxe", 1500000, ["Không hoàn tiền"]), room("Standard", null)],
		hotelRules: ["Check-in 14:00"],
		...overrides,
	};
}

let db: FakeD1;
type Db = Parameters<typeof syncHotel>[0];
const asDb = (d: FakeD1): Db => d as unknown as Db;

async function run(
	record: ParsedHotel,
	opts: { hash?: string; now?: string; autoPublish?: boolean; target?: Db; theTab?: SheetTab } = {},
) {
	return syncHotel(opts.target ?? asDb(db), {
		tab: opts.theTab ?? tab,
		record,
		hash: opts.hash ?? HASH_1,
		now: opts.now ?? NOW,
		autoPublish: opts.autoPublish ?? true,
	});
}

async function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
	const { results } = await (asDb(db)).prepare(sql).bind(...params).all<T>();
	return results as T[];
}

async function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T> {
	return (await (asDb(db)).prepare(sql).bind(...params).first<T>()) as T;
}

async function exec(sql: string, ...params: unknown[]): Promise<void> {
	await (asDb(db)).prepare(sql).bind(...params).run();
}

async function hotelId(): Promise<string> {
	return hotelIdFor(tab.fileId, tab.gid);
}

/** Row counts of every table this task writes, used to prove that nothing was written. */
async function writtenCounts(): Promise<Record<string, number>> {
	const tables = ["cities", "hotels", "hotel_images", "hotel_facilities", "rooms", "booking_rules"];
	const counts: Record<string, number> = {};
	for (const t of tables) {
		counts[t] = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))!.n;
	}
	return counts;
}

/** Table contents with the time columns removed, for the identical-run check. */
async function snapshot(): Promise<Record<string, unknown>> {
	return {
		cities: await rows("SELECT * FROM cities ORDER BY slug"),
		hotels: await rows(
			`SELECT id, slug, city_slug, name, name_search, stars, address, area, description_vi,
			        description_en, status, source_file_id, source_gid, source_hash
			 FROM hotels ORDER BY id`,
		),
		images: await rows("SELECT * FROM hotel_images ORDER BY hotel_id, position"),
		facilities: await rows("SELECT * FROM hotel_facilities ORDER BY hotel_id, code, source"),
		rooms: await rows(
			`SELECT id, hotel_id, name, name_search, bed_type, size_m2, view, max_guests, description,
			        base_price, source, sheet_room_id, position
			 FROM rooms ORDER BY id`,
		),
		rules: await rows("SELECT id, hotel_id, room_id, raw_text, status FROM booking_rules ORDER BY id"),
		syncState: await rows(
			`SELECT source_file_id, source_gid, hotel_id, tab_name, hash, missing_since,
			        hidden_by_sync, prior_status, last_error FROM sync_state ORDER BY source_gid`,
		),
	};
}

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
});

describe("syncHotel", () => {
	it("valid record creates hotel, rooms, rules, images", async () => {
		const result = await run(hotel());

		expect(result.outcome).toBe("created");
		expect(result.hotelId).toBe(await hotelId());
		expect(result.issues).toBeUndefined();
		expect(result.unmappedFacilities).toEqual([]);

		const h = await one<{ slug: string; status: string; name: string; city_slug: string }>(
			"SELECT slug, status, name, city_slug FROM hotels WHERE id = ?",
			await hotelId(),
		);
		expect(h).toEqual({
			slug: "da-nang-khach-san-bien-xanh",
			status: "published",
			name: "Khách sạn Biển Xanh",
			city_slug: "da-nang",
		});

		const roomNames = await rows<{ name: string; base_price: number | null }>(
			"SELECT name, base_price FROM rooms WHERE hotel_id = ? ORDER BY position",
			await hotelId(),
		);
		expect(roomNames).toEqual([
			{ name: "Deluxe", base_price: 1500000 },
			{ name: "Standard", base_price: null },
		]);

		const rules = await rows<{ raw_text: string }>(
			"SELECT raw_text FROM booking_rules WHERE hotel_id = ? ORDER BY raw_text",
			await hotelId(),
		);
		expect(rules.map((r) => r.raw_text).sort()).toEqual(["Check-in 14:00", "Không hoàn tiền"]);

		const images = await rows<{ url: string }>(
			"SELECT url FROM hotel_images WHERE hotel_id = ? ORDER BY position",
			await hotelId(),
		);
		expect(images.map((i) => i.url)).toEqual(["https://img.example/a.jpg", "https://img.example/b.jpg"]);

		const state = await one<{ hotel_id: string; hash: string; last_error: string | null }>(
			"SELECT hotel_id, hash, last_error FROM sync_state WHERE source_file_id = ? AND source_gid = ?",
			tab.fileId,
			tab.gid,
		);
		expect(state).toEqual({ hotel_id: await hotelId(), hash: HASH_1, last_error: null });

		// Overrides run after the sheet writes and bump data_version (1 seeded -> 2).
		expect(await one<{ value: string }>("SELECT value FROM settings WHERE key = 'data_version'")).toEqual({
			value: "2",
		});
	});

	it("invalid record writes nothing and reports issues", async () => {
		const before = await writtenCounts();
		const result = await run(hotel({ stars: 9 }));

		expect(result.outcome).toBe("invalid");
		expect(result.hotelId).toBe(await hotelId());
		expect(result.issues).toEqual([expect.objectContaining({ code: "stars_range", field: "stars" })]);
		expect(await writtenCounts()).toEqual(before);

		const state = await one<{ hash: string | null; last_error: string | null }>(
			"SELECT hash, last_error FROM sync_state WHERE source_file_id = ? AND source_gid = ?",
			tab.fileId,
			tab.gid,
		);
		expect(state.hash).toBeNull();
		expect(state.last_error).toContain("Stars must be a whole number");
	});

	it("invalid change to a published hotel leaves published data unchanged", async () => {
		await run(hotel());
		const published = await snapshot();

		const result = await run(
			hotel({
				descriptionVi: "Thay đổi",
				address: "Địa chỉ mới",
				rooms: [room("Deluxe", 999), room("deluxe", 1)],
			}),
			{ hash: HASH_2, now: LATER },
		);

		expect(result.outcome).toBe("invalid");
		expect(result.issues).toEqual([expect.objectContaining({ code: "room_duplicate" })]);

		const after = await snapshot();
		expect(after.hotels).toEqual(published.hotels);
		expect(after.rooms).toEqual(published.rooms);
		expect(after.rules).toEqual(published.rules);
		expect(after.images).toEqual(published.images);
		expect(after.facilities).toEqual(published.facilities);

		// The error is recorded, but the hash of the applied version is kept.
		const state = await one<{ hash: string; last_error: string | null }>(
			"SELECT hash, last_error FROM sync_state WHERE source_gid = ?",
			tab.gid,
		);
		expect(state.hash).toBe(HASH_1);
		expect(state.last_error).toContain("already used");
	});

	it("failure mid batch leaves no partial data and reports error", async () => {
		// Fails the third statement of the hotel batch (the image delete). The fake batch is a
		// real transaction, so the statements before it must be rolled back.
		const failing = {
			prepare: (sql: string) => db.prepare(sql),
			batch: (statements: Parameters<FakeD1["batch"]>[0]) =>
				db.batch(
					statements.map((s, i) =>
						i === 2
							? { all: async () => { throw new Error("disk I/O boom"); } }
							: s,
					) as unknown as Parameters<FakeD1["batch"]>[0],
				),
		} as unknown as Db;

		const before = await writtenCounts();
		const result = await run(hotel(), { target: failing });

		expect(result.outcome).toBe("error");
		expect(result.hotelId).toBe(await hotelId());
		expect(await writtenCounts()).toEqual(before);

		const state = await one<{ hash: string | null; last_error: string | null }>(
			"SELECT hash, last_error FROM sync_state WHERE source_gid = ?",
			tab.gid,
		);
		expect(state.hash).toBeNull();
		expect(state.last_error).toContain("disk I/O boom");
	});

	it("slug collision gets suffix, rename of tab keeps id and slug", async () => {
		const sameName = { ...tab, gid: "7" };
		const third = { ...tab, gid: "8" };

		const first = await run(hotel(), { theTab: tab });
		const second = await run(hotel(), { theTab: sameName });
		const thirdRun = await run(hotel(), { theTab: third });
		expect(first.outcome).toBe("created");
		expect(second.outcome).toBe("created");

		const slugOf = (id: string) => one<{ slug: string }>("SELECT slug FROM hotels WHERE id = ?", id);
		expect((await slugOf(first.hotelId)).slug).toBe("da-nang-khach-san-bien-xanh");
		expect((await slugOf(second.hotelId)).slug).toBe("da-nang-khach-san-bien-xanh-2");
		expect((await slugOf(thirdRun.hotelId)).slug).toBe("da-nang-khach-san-bien-xanh-3");

		// The tab is renamed: same file and gid, so same id, and the slug does not move.
		const renamed = { ...tab, tabName: "Biển Xanh Mới" };
		const again = await run(hotel(), { theTab: renamed, hash: HASH_2, now: LATER });
		expect(again.hotelId).toBe(first.hotelId);
		expect(again.outcome).toBe("updated");
		expect((await slugOf(first.hotelId)).slug).toBe("da-nang-khach-san-bien-xanh");
		expect(
			(await one<{ name: string }>("SELECT name FROM hotels WHERE id = ?", first.hotelId)).name,
		).toBe("Biển Xanh Mới");
	});

	it("returning tab restores prior status only when hidden by sync", async () => {
		await run(hotel());
		const id = await hotelId();

		// The tab went missing: sync hid the hotel and remembered the status.
		await exec("UPDATE hotels SET status = 'hidden' WHERE id = ?", id);
		await exec(
			"UPDATE sync_state SET hidden_by_sync = 1, prior_status = 'published', missing_since = ? WHERE source_gid = ?",
			NOW,
			tab.gid,
		);

		const result = await run(hotel(), { hash: HASH_2, now: LATER });
		expect(result.outcome).toBe("updated");
		expect(await one<{ status: string }>("SELECT status FROM hotels WHERE id = ?", id)).toEqual({
			status: "published",
		});
		expect(
			await one<{ hidden_by_sync: number; prior_status: string | null }>(
				"SELECT hidden_by_sync, prior_status FROM sync_state WHERE source_gid = ?",
				tab.gid,
			),
		).toEqual({ hidden_by_sync: 0, prior_status: null });

		// A hotel the owner hid (hidden_by_sync = 0) stays hidden.
		await exec("UPDATE hotels SET status = 'hidden' WHERE id = ?", id);
		await exec(
			"UPDATE sync_state SET hidden_by_sync = 0, prior_status = 'published' WHERE source_gid = ?",
			tab.gid,
		);
		await run(hotel(), { hash: HASH_2, now: LATER });
		expect(await one<{ status: string }>("SELECT status FROM hotels WHERE id = ?", id)).toEqual({
			status: "hidden",
		});
	});

	it("second identical run is updated with identical rows", async () => {
		const first = await run(hotel(), { now: NOW });
		const afterFirst = await snapshot();

		const second = await run(hotel(), { now: LATER });
		expect(first.outcome).toBe("created");
		expect(second.outcome).toBe("updated");
		expect(await snapshot()).toEqual(afterFirst);

		// synced_at moves to the new run time.
		expect(await one<{ synced_at: string }>("SELECT synced_at FROM hotels WHERE id = ?", first.hotelId)).toEqual({
			synced_at: LATER,
		});
	});

	it("override survives a sync", async () => {
		const id = await hotelId();
		await run(hotel());
		await exec(
			"INSERT INTO overrides (hotel_id, entity, entity_id, field, value, set_by, set_at) VALUES (?, 'hotel', '', 'area', 'Khu owner', 'owner', ?)",
			id,
			NOW,
		);
		await exec(
			"INSERT INTO overrides (hotel_id, entity, entity_id, field, value, set_by, set_at) VALUES (?, 'hotel', '', 'stars', '5', 'owner', ?)",
			id,
			NOW,
		);

		const result = await run(hotel({ area: "Sheet area", stars: 3 }), { hash: HASH_2, now: LATER });
		expect(result.outcome).toBe("updated");

		expect(await one<{ area: string; stars: number }>("SELECT area, stars FROM hotels WHERE id = ?", id)).toEqual({
			area: "Khu owner",
			stars: 5,
		});
	});
});
