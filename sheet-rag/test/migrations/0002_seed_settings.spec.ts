import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

// Migrations are applied in order: 0001 creates the settings table, 0002 seeds it.
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

async function migrate(db: FakeD1): Promise<void> {
	await db.exec(INIT_SQL);
	await db.exec(SEED_SQL);
}

async function freshMigratedDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await migrate(db);
	return db;
}

async function getValue(db: FakeD1, key: string): Promise<string | undefined> {
	const row = await db
		.prepare("SELECT value FROM settings WHERE key = ?")
		.bind(key)
		.first<{ value: string }>();
	return row?.value;
}

async function count(db: FakeD1, sql: string, ...params: unknown[]): Promise<number> {
	const row = await db.prepare(sql).bind(...params).first<{ n: number }>();
	return Number(row?.n);
}

describe("0002_seed_settings.sql", () => {
	it("seeds fee 10 and fee note true on an empty database", async () => {
		const db = await freshMigratedDb();

		expect(await getValue(db, "service_fee_percent")).toBe("10");
		expect(await getValue(db, "show_fee_note")).toBe("true");
	});

	it("seeds Vietnamese and English disclaimer exactly", async () => {
		const db = await freshMigratedDb();

		expect(await getValue(db, "disclaimer_vi")).toBe(DISCLAIMER_VI);
		expect(await getValue(db, "disclaimer_en")).toBe(DISCLAIMER_EN);
	});

	it("re-running all migrations leaves exactly one row per key", async () => {
		const db = await freshMigratedDb();

		// Each re-run must succeed (throws on failure).
		await migrate(db);
		await migrate(db);

		expect(
			await count(
				db,
				"SELECT COUNT(*) AS n FROM settings WHERE key IN (?, ?, ?, ?, ?)",
				"service_fee_percent",
				"show_fee_note",
				"disclaimer_vi",
				"disclaimer_en",
				"data_version",
			),
		).toBe(5);
		expect(await count(db, "SELECT COUNT(*) AS n FROM settings")).toBe(5);
	});

	it("re-running keeps a changed fee, fee note and disclaimer", async () => {
		const db = await freshMigratedDb();
		const editedDisclaimer = "Chỉnh sửa bởi quản trị viên.";

		await db
			.prepare("UPDATE settings SET value = ? WHERE key = ?")
			.bind("12", "service_fee_percent")
			.run();
		await db
			.prepare("UPDATE settings SET value = ? WHERE key = ?")
			.bind("false", "show_fee_note")
			.run();
		await db
			.prepare("UPDATE settings SET value = ? WHERE key = ?")
			.bind(editedDisclaimer, "disclaimer_vi")
			.run();

		await migrate(db);

		expect(await getValue(db, "service_fee_percent")).toBe("12");
		expect(await getValue(db, "show_fee_note")).toBe("false");
		expect(await getValue(db, "disclaimer_vi")).toBe(editedDisclaimer);
	});

	it("seeds data_version 1 and no phone or zalo keys", async () => {
		const db = await freshMigratedDb();

		expect(await getValue(db, "data_version")).toBe("1");
		expect(
			await count(
				db,
				"SELECT COUNT(*) AS n FROM settings WHERE key LIKE ? OR key LIKE ?",
				"%phone%",
				"%zalo%",
			),
		).toBe(0);
	});
});
