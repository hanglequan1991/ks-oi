import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getSettings } from "../../src/db/settings";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

const INIT_SQL = readFileSync(
	new URL("../../migrations/0001_init.sql", import.meta.url),
	"utf8",
);
const SEED_SQL = readFileSync(
	new URL("../../migrations/0002_seed_settings.sql", import.meta.url),
	"utf8",
);

// Expected texts are literals copied from implementation-plan.html section 5.
const DISCLAIMER_VI =
	"Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.";
const DISCLAIMER_EN =
	"Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.";

async function freshMigratedDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await db.exec(INIT_SQL);
	await db.exec(SEED_SQL);
	return db;
}

async function setSetting(db: FakeD1, key: string, value: string): Promise<void> {
	await db
		.prepare("UPDATE settings SET value = ? WHERE key = ?")
		.bind(value, key)
		.run();
}

describe("getSettings", () => {
	it("returns seeded fee, fee note and both disclaimers", async () => {
		const db = await freshMigratedDb();
		const onWarn = vi.fn();

		const settings = await getSettings(db as unknown as D1Database, onWarn);

		expect(settings.serviceFeePercent).toBe(10);
		expect(settings.showFeeNote).toBe(true);
		expect(settings.disclaimerVi).toBe(DISCLAIMER_VI);
		expect(settings.disclaimerEn).toBe(DISCLAIMER_EN);
		expect(onWarn).not.toHaveBeenCalled();
	});

	it("returns changed values after migrations are re-applied", async () => {
		const db = await freshMigratedDb();
		await setSetting(db, "service_fee_percent", "12");
		await setSetting(db, "show_fee_note", "false");

		await applyMigrations(db);

		const settings = await getSettings(db as unknown as D1Database, vi.fn());
		expect(settings.serviceFeePercent).toBe(12);
		expect(settings.showFeeNote).toBe(false);
	});

	it("invalid fee falls back to 10 and warns", async () => {
		const db = await freshMigratedDb();
		await setSetting(db, "service_fee_percent", "abc");
		const onWarn = vi.fn();

		const settings = await getSettings(db as unknown as D1Database, onWarn);

		expect(settings.serviceFeePercent).toBe(10);
		expect(onWarn).toHaveBeenCalledTimes(1);
		expect(typeof onWarn.mock.calls[0][0]).toBe("string");
	});

	it("empty settings table gives safe defaults", async () => {
		const db = createFakeD1();
		await db.exec(INIT_SQL);
		const onWarn = vi.fn();

		const settings = await getSettings(db as unknown as D1Database, onWarn);

		expect(settings).toEqual({
			serviceFeePercent: 10,
			showFeeNote: true,
			disclaimerVi: "",
			disclaimerEn: "",
		});
	});

	it("runs with no CLOUDFLARE_API_TOKEN in the environment", async () => {
		const saved = process.env.CLOUDFLARE_API_TOKEN;
		delete process.env.CLOUDFLARE_API_TOKEN;
		try {
			const db = await freshMigratedDb();

			const settings = await getSettings(db as unknown as D1Database, vi.fn());

			expect(settings.serviceFeePercent).toBe(10);
			expect(settings.showFeeNote).toBe(true);
		} finally {
			if (saved !== undefined) process.env.CLOUDFLARE_API_TOKEN = saved;
		}
	});
});
