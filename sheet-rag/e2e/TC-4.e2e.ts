// TC-4: Seeded settings hold the default fee, fee note and agreed disclaimer (STORY-13, AC3, AC4).
// Node-only test: no browser page. Uses the local fake D1 (node:sqlite), so no Cloudflare credentials are needed.

import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createFakeD1, type FakeD1 } from "../test/fakes/d1";
import { applyMigrations } from "../test/fakes/migrations";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// Expected texts are literals copied from implementation-plan.html section 5 (not read from any source or migration file).
const EXPECTED_DISCLAIMER_EN =
	"Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.";
const EXPECTED_DISCLAIMER_VI =
	"Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.";

// Version 1 has no phone or Zalo key.
const EXPECTED_KEYS = ["data_version", "disclaimer_en", "disclaimer_vi", "service_fee_percent", "show_fee_note"];

// The test must not pick up a Cloudflare token from the environment.
delete process.env.CLOUDFLARE_API_TOKEN;

async function settingValue(db: FakeD1, key: string): Promise<string | null> {
	const row = await db
		.prepare("SELECT value FROM settings WHERE key = ?")
		.bind(key)
		.first<{ value: string }>();
	return row === null || row === undefined ? null : row.value;
}

test.describe("TC-4: seeded settings hold the default fee, fee note and agreed disclaimer", () => {
	// This test does not use a browser page. Run it once, under the chromium project only.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(testInfo.project.name !== "chromium", "Node-only test: runs once, under chromium project");
	});

	test("seeded defaults match the agreed fee, fee note, disclaimers and key list", async () => {
		// Step 1: fresh database, run the migrations.
		const db = createFakeD1();
		await expect(applyMigrations(db, MIGRATIONS_DIR)).resolves.toBeUndefined();

		// Step 2: default fee.
		expect(await settingValue(db, "service_fee_percent")).toBe("10");

		// Step 3: fee note is on.
		expect(await settingValue(db, "show_fee_note")).toBe("true");

		// Step 4: both disclaimers are the agreed texts, exactly.
		const disclaimerEn = await settingValue(db, "disclaimer_en");
		const disclaimerVi = await settingValue(db, "disclaimer_vi");
		expect(disclaimerEn, "disclaimer_en must be present").not.toBeNull();
		expect(disclaimerVi, "disclaimer_vi must be present").not.toBeNull();

		// Both sides of the comparison must be NFC so that the same visible text is the same code points.
		expect(EXPECTED_DISCLAIMER_EN.normalize("NFC")).toBe(EXPECTED_DISCLAIMER_EN);
		expect(EXPECTED_DISCLAIMER_VI.normalize("NFC")).toBe(EXPECTED_DISCLAIMER_VI);
		expect((disclaimerEn as string).normalize("NFC")).toBe(disclaimerEn);
		expect((disclaimerVi as string).normalize("NFC")).toBe(disclaimerVi);

		// No leading or trailing space, final full stop kept, strict equality.
		expect(disclaimerEn).toBe(EXPECTED_DISCLAIMER_EN);
		expect(disclaimerVi).toBe(EXPECTED_DISCLAIMER_VI);

		// Step 5: the settings table holds exactly the Version 1 keys.
		const { results } = await db
			.prepare("SELECT key FROM settings ORDER BY key")
			.all<{ key: string }>();
		expect(results.map((row) => row.key)).toEqual(EXPECTED_KEYS);
	});
});
