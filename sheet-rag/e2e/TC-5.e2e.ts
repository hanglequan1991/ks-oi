// TC-5: Hotel status accepts review, published, hidden and rejects anything else (STORY-13, AC6).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const CITY = { slug: "da-nang", name_vi: "Da Nang", name_en: "Da Nang" };

// A CHECK or NOT NULL violation from SQLite. The exact wording is not pinned, only that it is a constraint error.
const CONSTRAINT_ERROR = /constraint failed/i;

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

const BASE_COLUMNS = [
	"id",
	"slug",
	"city_slug",
	"name",
	"name_search",
	"source_file_id",
	"source_gid",
	"source_hash",
	"synced_at",
];

// Inserts a hotel. When `status` is undefined the status column is left out, so the schema default applies.
// Otherwise the given value is bound as is (including null and '').
function insertHotel(db: FakeD1, n: number, status?: string | null) {
	const includeStatus = status !== undefined;
	const columns = includeStatus ? [...BASE_COLUMNS, "status"] : BASE_COLUMNS;
	const values: unknown[] = [
		`hotel-status-${n}`,
		`hotel-status-${n}`,
		CITY.slug,
		`Hotel Status ${n}`,
		`hotel status ${n}`,
		"file-status",
		String(n),
		`hash-status-${n}`,
		"2026-11-18T00:00:00Z",
	];
	if (includeStatus) values.push(status);
	const placeholders = columns.map(() => "?").join(", ");
	return db
		.prepare(`INSERT INTO hotels (${columns.join(", ")}) VALUES (${placeholders})`)
		.bind(...values)
		.run();
}

async function statusOf(db: FakeD1, id: string): Promise<string | null> {
	const row = await db
		.prepare("SELECT status FROM hotels WHERE id = ?")
		.bind(id)
		.first<{ status: string }>();
	return row === null || row === undefined ? null : row.status;
}

async function hotelCount(db: FakeD1): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) AS n FROM hotels")
		.first<{ n: number }>();
	return row === null || row === undefined ? -1 : Number(row.n);
}

test.describe("TC-5: hotel status accepts review, published, hidden and rejects anything else", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("valid statuses are stored, invalid ones are rejected, default is review", async () => {
		// Step 1: fresh database, run the migrations, insert a city.
		const db = createFakeD1();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();
		await db
			.prepare("INSERT INTO cities (slug, name_vi, name_en) VALUES (?, ?, ?)")
			.bind(CITY.slug, CITY.name_vi, CITY.name_en)
			.run();

		// Step 2: three hotels with the valid explicit statuses.
		await expect(insertHotel(db, 1, "review")).resolves.toBeDefined();
		await expect(insertHotel(db, 2, "published")).resolves.toBeDefined();
		await expect(insertHotel(db, 3, "hidden")).resolves.toBeDefined();

		// Step 3: a hotel with no status given takes the default.
		await expect(insertHotel(db, 4)).resolves.toBeDefined();
		expect(await statusOf(db, "hotel-status-4"), "default status must be review").toBe("review");

		// Step 4: invalid statuses are each rejected with a constraint error, and no row is added.
		const invalid: Array<{ label: string; status: string | null }> = [
			{ label: "live", status: "live" },
			{ label: "Published (different case)", status: "Published" },
			{ label: "empty string", status: "" },
			{ label: "NULL", status: null },
		];
		for (const [i, bad] of invalid.entries()) {
			await expect(insertHotel(db, 100 + i, bad.status), `status ${bad.label} must be rejected`).rejects.toThrow(
				CONSTRAINT_ERROR,
			);
		}
		expect(await hotelCount(db), "rejected inserts must not add rows").toBe(4);

		// Step 5: updating an existing hotel to archived is rejected, and the hotel keeps its old status.
		await expect(
			db
				.prepare("UPDATE hotels SET status = ? WHERE id = ?")
				.bind("archived", "hotel-status-2")
				.run(),
			"update to archived must be rejected",
		).rejects.toThrow(CONSTRAINT_ERROR);
		expect(await statusOf(db, "hotel-status-2")).toBe("published");

		// Step 6: count hotels per status. Only the three valid values appear.
		const { results } = await db
			.prepare("SELECT status, COUNT(*) AS n FROM hotels GROUP BY status ORDER BY status")
			.all<{ status: string; n: number }>();
		const counts = Object.fromEntries(results.map((row) => [row.status, Number(row.n)]));
		expect(counts).toEqual({ hidden: 1, published: 1, review: 2 });
		expect(results.map((row) => row.status).every((s) => ["review", "published", "hidden"].includes(s))).toBe(true);
	});
});
