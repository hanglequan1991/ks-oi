import { describe, expect, it } from "vitest";
import { listPublishedHotels, type HotelListQuery } from "../../src/db/hotelList";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { seedApiSample, seedManyPublished } from "../fixtures/apiSample";

// The fixture takes a D1Database; the fake is cast the same way the other tests do.
async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

function query(overrides: Partial<HotelListQuery> = {}): HotelListQuery {
	return { facilities: [], sort: "name", page: 1, limit: 50, ...overrides };
}

async function slugsOf(db: FakeD1, q: HotelListQuery): Promise<string[]> {
	const { rows } = await listPublishedHotels(db as unknown as D1Database, q);
	return rows.map((row) => row.slug);
}

async function countHotels(db: FakeD1): Promise<number> {
	const row = await db.prepare("SELECT COUNT(*) AS n FROM hotels").first<{ n: number }>();
	return Number(row?.n);
}

describe("listPublishedHotels", () => {
	it("returns only published hotels", async () => {
		const db = await sampleDb();
		const result = await listPublishedHotels(db as unknown as D1Database, query());

		expect(result.rows.map((row) => row.slug)).toEqual([
			"dong-do-hotel",
			"mong-hotel",
			"sao-hotel",
		]);
		expect(result.total).toBe(3);
	});

	it("pages with a stable order and a true total, and caps the limit", async () => {
		const db = await sampleDb();
		await seedManyPublished(db as unknown as D1Database, 60);
		const d1 = db as unknown as D1Database;

		const first = await listPublishedHotels(d1, query({ page: 1, limit: 50 }));
		expect(first.rows).toHaveLength(50);
		expect(first.total).toBe(63);

		const second = await listPublishedHotels(d1, query({ page: 2, limit: 50 }));
		expect(second.rows).toHaveLength(13);
		expect(second.total).toBe(63);

		const firstSlugs = new Set(first.rows.map((row) => row.slug));
		for (const row of second.rows) expect(firstSlugs.has(row.slug)).toBe(false);

		// A direct caller asking for more than 50 still gets at most 50.
		const capped = await listPublishedHotels(d1, query({ page: 1, limit: 500 }));
		expect(capped.rows.length).toBeLessThanOrEqual(50);
		expect(capped.rows).toHaveLength(50);
		expect(capped.total).toBe(63);
	});

	it("filters by city, stars and facility (all facilities must match)", async () => {
		const db = await sampleDb();

		expect(await slugsOf(db, query({ city: "da-nang" }))).toEqual([
			"dong-do-hotel",
			"mong-hotel",
		]);
		expect(await slugsOf(db, query({ stars: [5] }))).toEqual(["dong-do-hotel"]);
		expect(await slugsOf(db, query({ stars: [3, 4] }))).toHaveLength(2);
		expect(await slugsOf(db, query({ facilities: ["pool"] }))).toEqual([
			"dong-do-hotel",
			"mong-hotel",
		]);
		expect(await slugsOf(db, query({ facilities: ["pool", "elevator"] }))).toEqual([
			"dong-do-hotel",
		]);
	});

	it("search text works without accents and ignores case", async () => {
		const db = await sampleDb();

		expect(await slugsOf(db, query({ q: "mong" }))).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, query({ q: "Mộng" }))).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, query({ q: "MONG hotel" }))).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, query({ q: "dong do" }))).toEqual(["dong-do-hotel"]);
		expect(await slugsOf(db, query({ q: "Đông Đô" }))).toEqual(["dong-do-hotel"]);

		const none = await listPublishedHotels(
			db as unknown as D1Database,
			query({ city: "ha-noi", facilities: ["pool"], q: "mong" }),
		);
		expect(none).toEqual({ rows: [], total: 0 });
	});

	it("non-published hotels stay hidden under every filter", async () => {
		const db = await sampleDb();

		expect(await slugsOf(db, query({ city: "hue" }))).toEqual([]);
		expect(await slugsOf(db, query({ city: "da-nang", q: "mong" }))).toEqual(["mong-hotel"]);
		expect(await slugsOf(db, query({ q: "review" }))).toEqual([]);
		expect(await slugsOf(db, query({ q: "hidden" }))).toEqual([]);
		expect(await slugsOf(db, query({ stars: [3, 4, 5] }))).not.toContain("mong-review");
		expect(await slugsOf(db, query({ sort: "price" }))).not.toContain("mong-review");
		expect(await slugsOf(db, query({ sort: "price" }))).not.toContain("mong-hidden");
	});

	it("lowest base price ignores unpriced rooms and is null when none is priced", async () => {
		const db = await sampleDb();
		const { rows } = await listPublishedHotels(db as unknown as D1Database, query());
		const bySlug = new Map(rows.map((row) => [row.slug, row]));

		expect(bySlug.get("mong-hotel")?.min_base_price).toBe(1250000);
		expect(bySlug.get("sao-hotel")?.min_base_price).toBe(980000);
		expect(bySlug.get("dong-do-hotel")?.min_base_price).toBeNull();

		expect(bySlug.get("mong-hotel")?.image_url).toBe("https://example.test/mong-0.jpg");
		expect(bySlug.get("dong-do-hotel")?.image_url).toBeNull();

		expect(bySlug.get("mong-hotel")).toMatchObject({
			city_slug: "da-nang",
			city_name_vi: "Đà Nẵng",
			city_name_en: "Da Nang",
			stars: 4,
		});
		expect(bySlug.get("sao-hotel")?.city_name_en).toBeNull();
	});

	it("search-syntax and SQL text is harmless", async () => {
		const db = await sampleDb();
		const d1 = db as unknown as D1Database;

		// Blank or absent q is ignored. A non-blank q that folds to no tokens matches nothing.
		const allThree = ["dong-do-hotel", "mong-hotel", "sao-hotel"];
		expect(await slugsOf(db, query({ q: "   " }))).toEqual(allThree);
		expect(await slugsOf(db, query())).toEqual(allThree);
		expect(await listPublishedHotels(d1, query({ q: "%" }))).toEqual({ rows: [], total: 0 });

		expect(await slugsOf(db, query({ q: "a_b" }))).toEqual([]);

		const injected = await listPublishedHotels(
			d1,
			query({ q: '"; DROP TABLE hotels;--' }),
		);
		expect(injected).toEqual({ rows: [], total: 0 });
		expect(await countHotels(db)).toBe(5);
	});

	it("sort by price puts unpriced hotels last", async () => {
		const db = await sampleDb();
		expect(await slugsOf(db, query({ sort: "price" }))).toEqual([
			"sao-hotel",
			"mong-hotel",
			"dong-do-hotel",
		]);
	});

	it("sort by stars puts unknown stars last, then by name", async () => {
		const db = await sampleDb();
		expect(await slugsOf(db, query({ sort: "stars" }))).toEqual([
			"dong-do-hotel",
			"mong-hotel",
			"sao-hotel",
		]);
	});
});
