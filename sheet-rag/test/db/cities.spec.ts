import { describe, expect, it } from "vitest";
import { listCitiesWithPublishedHotels } from "../../src/db/cities";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { seedApiSample } from "../fixtures/apiSample";

async function sampleDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	await seedApiSample(db as unknown as D1Database);
	return db;
}

describe("listCitiesWithPublishedHotels", () => {
	it("cities lists only cities with published hotels with both names", async () => {
		const db = await sampleDb();
		const d1 = db as unknown as D1Database;

		// hue has only a hidden hotel, so it is left out.
		expect(await listCitiesWithPublishedHotels(d1)).toEqual([
			{ slug: "da-nang", name_vi: "Đà Nẵng", name_en: "Da Nang" },
			{ slug: "ha-noi", name_vi: "Hà Nội", name_en: null },
		]);

		// Hiding every ha-noi hotel removes the city.
		await db
			.prepare("UPDATE hotels SET status = 'hidden' WHERE city_slug = ?")
			.bind("ha-noi")
			.run();
		expect(await listCitiesWithPublishedHotels(d1)).toEqual([
			{ slug: "da-nang", name_vi: "Đà Nẵng", name_en: "Da Nang" },
		]);
	});
});
