import { describe, expect, it } from "vitest";
import { suggestHotels } from "../../src/db/suggest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { seedApiSample, seedManyPublished } from "../fixtures/apiSample";

async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

async function slugsOf(db: FakeD1, text: string, limit: number): Promise<string[]> {
	const rows = await suggestHotels(db as unknown as D1Database, text, limit);
	return rows.map((row) => row.slug);
}

async function count(db: FakeD1, table: string): Promise<number> {
	const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
	return Number(row?.n);
}

describe("suggestHotels", () => {
	it("suggest matches by accent-free prefix and returns published hotels only", async () => {
		const db = await sampleDb();

		expect(await slugsOf(db, "mo", 8)).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, "Mộng", 8)).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, "MONG", 8)).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, "mong h", 8)).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, "sao", 8)).toEqual(["sao-hotel"]);
		expect(await slugsOf(db, "Đông", 8)).toEqual(["dong-do-hotel"]);
		expect(await slugsOf(db, "dong", 8)).toEqual(["dong-do-hotel"]);
		// Prefix on the whole folded name, not a contains match.
		expect(await slugsOf(db, "ong", 8)).toEqual([]);
		expect(await slugsOf(db, "hotel", 8)).toEqual([]);
	});

	it("suggest returns slug, name and city and respects the limit", async () => {
		const db = await sampleDb();
		await seedManyPublished(db as unknown as D1Database, 60);
		const d1 = db as unknown as D1Database;

		const rows = await suggestHotels(d1, "mong", 8);
		expect(rows).toEqual([
			{
				slug: "mong-hotel",
				name: "Mộng Hotel",
				city_slug: "da-nang",
				city_name_vi: "Đà Nẵng",
				city_name_en: "Da Nang",
			},
		]);

		const sao = await suggestHotels(d1, "sao", 8);
		expect(sao[0]).toEqual({
			slug: "sao-hotel",
			name: "Sao Hà Nội",
			city_slug: "ha-noi",
			city_name_vi: "Hà Nội",
			city_name_en: null,
		});

		expect(await suggestHotels(d1, "bulk", 5)).toHaveLength(5);
		expect(await suggestHotels(d1, "bulk", 10)).toHaveLength(10);
		expect(await suggestHotels(d1, "bulk", 99)).toHaveLength(10);
		expect(await suggestHotels(d1, "bulk", 0)).toHaveLength(1);
		expect(await suggestHotels(d1, "bulk", Number.NaN)).toHaveLength(8);
	});

	it("suggest is safe with search-syntax and SQL characters", async () => {
		const db = await sampleDb();
		const hotelsBefore = await count(db, "hotels");
		const settingsBefore = await count(db, "settings");

		expect(await slugsOf(db, "%", 8)).toEqual([]);
		expect(await slugsOf(db, "_", 8)).toEqual([]);
		expect(await slugsOf(db, '"*', 8)).toEqual([]);
		expect(await slugsOf(db, "a OR b", 8)).toEqual([]);
		expect(await slugsOf(db, "'; DROP TABLE hotels;--", 8)).toEqual([]);
		expect(await slugsOf(db, "***", 8)).toEqual([]);

		expect(await count(db, "hotels")).toBe(hotelsBefore);
		expect(await count(db, "settings")).toBe(settingsBefore);
	});
});
