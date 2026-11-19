// TC-1: Migrations create all tables on an empty database (STORY-13, AC1).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");
const SEED_FILE = join(MIGRATIONS_DIR, "0002_seed_settings.sql");

const REQUIRED_TABLES = [
	"cities",
	"hotels",
	"rooms",
	"facility_catalog",
	"hotel_facilities",
	"hotel_images",
	"booking_rules",
	"settings",
	"overrides",
];

// Sync tables (migration 0003) are in scope. Out-of-scope prefixes for Version 1 are the Mytour crawl and admin.
const SYNC_TABLES = ["sync_state", "sync_runs"];
const OUT_OF_SCOPE_PREFIXES = ["crawl_", "admin_"];

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

async function userTables(db: ReturnType<typeof createFakeD1>): Promise<string[]> {
	const { results } = await db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		)
		.all<{ name: string }>();
	return results.map((row) => row.name);
}

test.describe("TC-1: migrations create all tables on an empty database", () => {
	// This test does not use a browser page. Run it once, under the first project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("empty database, migrations create the schema, seed alone is rejected", async () => {
		// Step 1: create an empty database.
		const db = createFakeD1();

		// Step 2: no user tables yet.
		expect(await userTables(db)).toEqual([]);

		// Step 3: apply all migrations in name order.
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 4: the required tables exist.
		const tables = await userTables(db);
		for (const table of REQUIRED_TABLES) {
			expect(tables, `table "${table}" should exist`).toContain(table);
		}
		for (const table of SYNC_TABLES) {
			expect(tables, `sync table "${table}" should exist (migration 0003)`).toContain(table);
		}

		// Step 6: no out-of-scope tables were created (sync tables are allowed).
		const requiredOrSync = [...REQUIRED_TABLES, ...SYNC_TABLES];
		for (const table of tables.filter((t) => !requiredOrSync.includes(t))) {
			for (const prefix of OUT_OF_SCOPE_PREFIXES) {
				expect(table.startsWith(prefix), `table "${table}" must not exist in Version 1`).toBe(false);
			}
		}

		// Step 5 (negative): a fresh database with only the seed file must reject,
		// because the settings table is created by 0001 and the seed does not create the schema.
		const bare = createFakeD1();
		const seedSql = readFileSync(SEED_FILE, "utf8");
		await expect(bare.exec(seedSql)).rejects.toThrow(/no such table: settings/);
		expect(await userTables(bare)).toEqual([]);
	});
});
