// TC-9: Application reads the settings through getSettings with a local database (STORY-13, AC10; re-checks AC3, AC4, AC5).
// Node-only test: no browser page. Imports getSettings from src/db/settings.ts and runs it against the local fake D1 (node:sqlite).
// The network is blocked: globalThis.fetch is replaced by a function that fails the test if it is called.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { getSettings } from "../src/db/settings";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// Expected texts are literals copied from implementation-plan.html section 5 (same literals as TC-4, not read from any source or migration file).
const EXPECTED_DISCLAIMER_EN =
	"Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.";
const EXPECTED_DISCLAIMER_VI =
	"Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.";

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

// getSettings expects a D1Database. The fake implements only the subset used by the project, so it is cast.
type Db = Parameters<typeof getSettings>[0];
function asD1(db: FakeD1): Db {
	return db as unknown as Db;
}

async function run(db: FakeD1, sql: string, params: unknown[] = []): Promise<void> {
	await db.prepare(sql).bind(...params).run();
}

const originalFetch = globalThis.fetch;
let fetchCalls = 0;

test.describe("TC-9: application reads the settings through getSettings with a local database", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test.beforeEach(() => {
		// Block the network: any fetch call is counted and throws.
		fetchCalls = 0;
		globalThis.fetch = (async (input: unknown) => {
			fetchCalls += 1;
			throw new Error(`Unexpected network call during TC-9: ${String(input)}`);
		}) as typeof fetch;
	});

	test.afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("getSettings returns defaults, updated values, falls back on bad fee, and tolerates an empty table", async () => {
		// Step 1: fresh fake D1, migrations applied, getSettings returns the seeded defaults.
		const db = createFakeD1();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		const defaults = await getSettings(asD1(db));
		expect(defaults).toEqual({
			serviceFeePercent: 10,
			showFeeNote: true,
			disclaimerVi: EXPECTED_DISCLAIMER_VI,
			disclaimerEn: EXPECTED_DISCLAIMER_EN,
		});

		// Step 2: change the fee to 12 and the fee note to false, re-run the migrations, read again.
		// The migrations use INSERT OR IGNORE, so the admin change must survive the re-run.
		await run(db, "UPDATE settings SET value = ? WHERE key = ?", ["12", "service_fee_percent"]);
		await run(db, "UPDATE settings SET value = ? WHERE key = ?", ["false", "show_fee_note"]);
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		const updated = await getSettings(asD1(db));
		expect(updated.serviceFeePercent).toBe(12);
		expect(updated.showFeeNote).toBe(false);
		expect(updated.disclaimerVi).toBe(EXPECTED_DISCLAIMER_VI);
		expect(updated.disclaimerEn).toBe(EXPECTED_DISCLAIMER_EN);

		// Step 3: an invalid fee falls back to 10 and reports exactly one warning.
		await run(db, "UPDATE settings SET value = ? WHERE key = ?", ["abc", "service_fee_percent"]);
		const warnings: string[] = [];
		const onWarn = (msg: string) => {
			warnings.push(msg);
		};
		const invalid = await getSettings(asD1(db), onWarn);
		expect(invalid.serviceFeePercent).toBe(10);
		expect(warnings, "onWarn must be called exactly once").toHaveLength(1);

		// Step 4: empty the settings table. No error is thrown; defaults for fee and note, empty disclaimers.
		await run(db, "DELETE FROM settings");
		const emptyWarnings: string[] = [];
		const empty = await getSettings(asD1(db), (msg) => {
			emptyWarnings.push(msg);
		});
		expect(empty).toEqual({
			serviceFeePercent: 10,
			showFeeNote: true,
			disclaimerVi: "",
			disclaimerEn: "",
		});

		// Expected 5: no network call was made during the whole test, and no Cloudflare token was set.
		expect(fetchCalls, "fetch must not be called").toBe(0);
		expect(process.env.CLOUDFLARE_API_TOKEN, "no Cloudflare token in the environment").toBeUndefined();
	});
});
