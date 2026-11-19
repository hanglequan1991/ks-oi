// TC-3: A setting changed after seeding survives a migration re-run (STORY-13, AC5).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const DEFAULT_DISCLAIMER_VI =
	"Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.";
const EDITED_FEE = "12";
const EDITED_FEE_NOTE = "false";
const EDITED_DISCLAIMER_EN = "Custom English text";
const DEFAULT_DATA_VERSION = "1";

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

async function settingsMap(db: FakeD1): Promise<Record<string, string>> {
	const { results } = await db
		.prepare("SELECT key, value FROM settings ORDER BY key")
		.all<{ key: string; value: string }>();
	return Object.fromEntries(results.map((row) => [row.key, row.value]));
}

async function settingsCount(db: FakeD1): Promise<number> {
	const row = await db.prepare("SELECT COUNT(*) AS n FROM settings").first<{ n: number }>();
	return Number(row?.n ?? 0);
}

test.describe("TC-3: a setting changed after seeding survives a migration re-run", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("edited settings are kept after re-running migrations, deleted seed key is re-created", async () => {
		const db = createFakeD1();

		// Step 1: fresh database, apply migrations (seeded defaults).
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 2: edit three settings. Each update must affect exactly one row.
		const feeUpdate = await db
			.prepare("UPDATE settings SET value = ? WHERE key = 'service_fee_percent'")
			.bind(EDITED_FEE)
			.run();
		expect(feeUpdate.meta.changes).toBe(1);

		const feeNoteUpdate = await db
			.prepare("UPDATE settings SET value = ? WHERE key = 'show_fee_note'")
			.bind(EDITED_FEE_NOTE)
			.run();
		expect(feeNoteUpdate.meta.changes).toBe(1);

		const disclaimerUpdate = await db
			.prepare("UPDATE settings SET value = ? WHERE key = 'disclaimer_en'")
			.bind(EDITED_DISCLAIMER_EN)
			.run();
		expect(disclaimerUpdate.meta.changes).toBe(1);

		// Step 3: re-run migrations. The re-run must succeed.
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 4: read all settings rows. Edited values are kept, untouched seed value is kept, no duplicates.
		const afterRerun = await settingsMap(db);
		expect(afterRerun.service_fee_percent).toBe(EDITED_FEE);
		expect(afterRerun.show_fee_note).toBe(EDITED_FEE_NOTE);
		expect(afterRerun.disclaimer_en).toBe(EDITED_DISCLAIMER_EN);
		expect(afterRerun.disclaimer_vi).toBe(DEFAULT_DISCLAIMER_VI);
		expect(await settingsCount(db), "settings must still have 6 rows").toBe(6);

		// Step 5 (edge): delete the data_version row, re-run migrations, read settings again.
		const deleted = await db.prepare("DELETE FROM settings WHERE key = 'data_version'").run();
		expect(deleted.meta.changes).toBe(1);
		expect(afterRerun.data_version).toBe(DEFAULT_DATA_VERSION);

		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		const afterEdgeRerun = await settingsMap(db);
		expect(afterEdgeRerun.data_version, "deleted seed key is re-created with its default").toBe(DEFAULT_DATA_VERSION);
		expect(afterEdgeRerun.service_fee_percent).toBe(EDITED_FEE);
		expect(afterEdgeRerun.show_fee_note).toBe(EDITED_FEE_NOTE);
		expect(afterEdgeRerun.disclaimer_en).toBe(EDITED_DISCLAIMER_EN);
		expect(await settingsCount(db)).toBe(6);
	});
});
