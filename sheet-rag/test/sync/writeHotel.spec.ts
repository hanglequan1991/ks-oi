import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import {
	buildHotelStatements,
	unmappedFacilities,
	type HotelWriteContext,
} from "../../src/sync/writeHotel";
import type { ParsedHotel } from "../../src/sync/record";
import type { SheetTab } from "../../src/sync/sheetSource";

const NOW = "2026-11-19T10:00:00Z";

const tab: SheetTab = {
	fileId: "file-1",
	fileName: "Đà Nẵng",
	gid: "42",
	tabName: "Khách sạn Biển Xanh",
};

const record: ParsedHotel = {
	stars: 4,
	address: "12 Lê Lợi",
	area: "Hải Châu",
	descriptionVi: "Mô tả tiếng Việt",
	descriptionEn: "English description",
	images: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
	facilities: ["Hồ bơi", "Bãi đỗ xe"],
	rooms: [],
	hotelRules: [],
};

const HOTEL_ID = "0123456789abcdef";

function ctx(overrides: Partial<HotelWriteContext> = {}): HotelWriteContext {
	return {
		tab,
		record,
		hotelId: HOTEL_ID,
		slug: "khach-san-bien-xanh",
		now: NOW,
		autoPublish: true,
		existingStatus: null,
		hash: "hash-1",
		...overrides,
	};
}

/** Builds and runs the hotel statements in one batch, as the caller does. */
async function write(db: FakeD1, input: HotelWriteContext): Promise<void> {
	const statements = buildHotelStatements(db as unknown as D1Database, input);
	await db.batch(statements as unknown as Parameters<FakeD1["batch"]>[0]);
}

async function row<T>(db: FakeD1, sql: string, ...params: unknown[]): Promise<T> {
	const statement = (db as unknown as D1Database).prepare(sql).bind(...params);
	return (await statement.first<T>()) as T;
}

async function rows<T>(db: FakeD1, sql: string, ...params: unknown[]): Promise<T[]> {
	const statement = (db as unknown as D1Database).prepare(sql).bind(...params);
	return (await statement.all<T>()).results;
}

async function seedCatalog(db: FakeD1): Promise<void> {
	await db.exec(`
		INSERT INTO facility_catalog (code, category, label_vi, label_en, synonyms) VALUES
		  ('pool', 'facility', 'Hồ bơi', 'Pool', '["ho boi","pool","be boi"]'),
		  ('parking', 'facility', 'Bãi đỗ xe', 'Parking', '["bai do xe","parking"]'),
		  ('elevator', 'building', 'Thang máy', 'Elevator', '["thang may","elevator"]');
	`);
}

describe("buildHotelStatements", () => {
	let db: FakeD1;

	beforeEach(async () => {
		db = createFakeD1();
		await applyMigrations(db);
		await seedCatalog(db);
	});

	it("creates city and hotel with folded name_search and verbatim fields", async () => {
		await write(db, ctx());

		const city = await row<{ slug: string; name_vi: string }>(
			db,
			"SELECT slug, name_vi FROM cities",
		);
		expect(city).toEqual({ slug: "da-nang", name_vi: "Đà Nẵng" });

		const hotel = await row<Record<string, unknown>>(
			db,
			"SELECT id, slug, city_slug, name, name_search, stars, address, area, description_vi, description_en, status, source_file_id, source_gid, source_hash, synced_at, rooms_synced_at, facilities_synced_at FROM hotels WHERE id = ?",
			HOTEL_ID,
		);
		expect(hotel).toEqual({
			id: HOTEL_ID,
			slug: "khach-san-bien-xanh",
			city_slug: "da-nang",
			name: "Khách sạn Biển Xanh",
			name_search: "khach san bien xanh",
			stars: 4,
			address: "12 Lê Lợi",
			area: "Hải Châu",
			description_vi: "Mô tả tiếng Việt",
			description_en: "English description",
			status: "published",
			source_file_id: "file-1",
			source_gid: "42",
			source_hash: "hash-1",
			synced_at: NOW,
			rooms_synced_at: NOW,
			facilities_synced_at: NOW,
		});
	});

	it("second run with same input changes nothing", async () => {
		await write(db, ctx());
		const snapshot = async () => ({
			cities: await rows(db, "SELECT * FROM cities ORDER BY slug"),
			hotels: await rows(db, "SELECT * FROM hotels ORDER BY id"),
			images: await rows(db, "SELECT * FROM hotel_images ORDER BY url"),
			facilities: await rows(db, "SELECT * FROM hotel_facilities ORDER BY code"),
		});
		const first = await snapshot();

		await write(db, ctx());

		expect(await snapshot()).toEqual(first);
	});

	it("slug is not changed by a later run or tab rename; id is stable", async () => {
		await write(db, ctx());

		await write(
			db,
			ctx({
				slug: "another-slug",
				tab: { ...tab, tabName: "Tên mới" },
				now: "2026-11-20T10:00:00Z",
			}),
		);

		const hotel = await row<{ id: string; slug: string; name: string; name_search: string; synced_at: string }>(
			db,
			"SELECT id, slug, name, name_search, synced_at FROM hotels",
		);
		expect(hotel.id).toBe(HOTEL_ID);
		expect(hotel.slug).toBe("khach-san-bien-xanh");
		expect(hotel.name).toBe("Tên mới");
		expect(hotel.name_search).toBe("ten moi");
		expect(hotel.synced_at).toBe("2026-11-20T10:00:00Z");
		expect(await rows(db, "SELECT id FROM hotels")).toHaveLength(1);
	});

	it("new hotel is published when autoPublish is true and review when false", async () => {
		await write(db, ctx({ autoPublish: true }));
		await write(
			db,
			ctx({
				tab: { ...tab, gid: "43", tabName: "Khách sạn Thứ Hai" },
				hotelId: "aaaaaaaaaaaaaaaa",
				slug: "second",
				autoPublish: false,
				existingStatus: null,
			}),
		);

		const statusOf = async (id: string) =>
			(await row<{ status: string }>(db, "SELECT status FROM hotels WHERE id = ?", id)).status;
		expect(await statusOf(HOTEL_ID)).toBe("published");
		expect(await statusOf("aaaaaaaaaaaaaaaa")).toBe("review");
	});

	it("existing published, review and owner-hidden hotels keep their status even with autoPublish true", async () => {
		await write(db, ctx({ autoPublish: false }));
		const statusOf = async () =>
			(await row<{ status: string }>(db, "SELECT status FROM hotels WHERE id = ?", HOTEL_ID)).status;

		expect(await statusOf()).toBe("review");
		await write(db, ctx({ autoPublish: true, existingStatus: "review" }));
		expect(await statusOf()).toBe("review");

		for (const status of ["published", "hidden"] as const) {
			await db.exec(`UPDATE hotels SET status = '${status}' WHERE id = '${HOTEL_ID}'`);
			await write(db, ctx({ autoPublish: true, existingStatus: status }));
			expect(await statusOf()).toBe(status);
		}
	});

	it("images replaced in order, duplicates dropped", async () => {
		await write(
			db,
			ctx({
				record: {
					...record,
					images: ["https://img.example/1.jpg", "https://img.example/2.jpg", "https://img.example/1.jpg", "https://img.example/3.jpg"],
				},
			}),
		);
		expect(
			await rows(db, "SELECT url, position FROM hotel_images WHERE hotel_id = ? ORDER BY position", HOTEL_ID),
		).toEqual([
			{ url: "https://img.example/1.jpg", position: 0 },
			{ url: "https://img.example/2.jpg", position: 1 },
			{ url: "https://img.example/3.jpg", position: 2 },
		]);

		await write(db, ctx({ record: { ...record, images: ["https://img.example/9.jpg"] } }));
		expect(
			await rows(db, "SELECT url, position FROM hotel_images WHERE hotel_id = ? ORDER BY position", HOTEL_ID),
		).toEqual([{ url: "https://img.example/9.jpg", position: 0 }]);
	});

	it("sheet facilities replaced via synonyms, mytour rows kept, unknown reported", async () => {
		// The hotel row must exist before facility rows can reference it.
		await write(db, ctx({ record: { ...record, facilities: [] } }));
		await db.exec(
			`INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('${HOTEL_ID}', 'elevator', 'mytour', 1)`,
		);
		await db.exec(
			`INSERT INTO hotel_facilities (hotel_id, code, source, confirmed) VALUES ('${HOTEL_ID}', 'pool', 'sheet', 1)`,
		);

		const labels = ["Hồ bơi", "bai do xe", "Sân golf", "Thang máy"];
		await write(db, ctx({ record: { ...record, facilities: labels } }));

		expect(
			await rows(db, "SELECT code, source FROM hotel_facilities WHERE hotel_id = ? ORDER BY code", HOTEL_ID),
		).toEqual([
			{ code: "elevator", source: "mytour" },
			{ code: "parking", source: "sheet" },
			{ code: "pool", source: "sheet" },
		]);

		expect(await unmappedFacilities(db as unknown as D1Database, labels)).toEqual(["Sân golf"]);
	});
});
