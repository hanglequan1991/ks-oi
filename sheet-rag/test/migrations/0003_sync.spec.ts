import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

// Migrations are applied in order: 0001 creates the tables, 0002 seeds settings, 0003 adds sync.
const INIT_SQL = readFileSync(
	new URL("../../migrations/0001_init.sql", import.meta.url),
	"utf8",
);
const SEED_SQL = readFileSync(
	new URL("../../migrations/0002_seed_settings.sql", import.meta.url),
	"utf8",
);
const SYNC_SQL = readFileSync(
	new URL("../../migrations/0003_sync.sql", import.meta.url),
	"utf8",
);

async function migrate(db: FakeD1): Promise<void> {
	await db.exec(INIT_SQL);
	await db.exec(SEED_SQL);
	await db.exec(SYNC_SQL);
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

interface ColumnInfo {
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

async function columns(db: FakeD1, table: string): Promise<Record<string, ColumnInfo>> {
	const rows = await db
		.prepare(`PRAGMA table_info(${table})`)
		.all<ColumnInfo>();
	return Object.fromEntries(rows.results.map((c) => [c.name, c]));
}

describe("0003_sync.sql", () => {
	it("creates sync_state and sync_runs with the listed columns", async () => {
		const db = await freshMigratedDb();

		const state = await columns(db, "sync_state");
		expect(Object.keys(state).sort()).toEqual(
			[
				"source_file_id",
				"source_gid",
				"hotel_id",
				"tab_name",
				"hash",
				"last_seen_at",
				"missing_since",
				"hidden_by_sync",
				"prior_status",
				"last_error",
				"updated_at",
			].sort(),
		);
		expect(state.source_file_id.pk).toBe(1);
		expect(state.source_gid.pk).toBe(2);
		expect(state.hotel_id.notnull).toBe(0);
		expect(state.missing_since.notnull).toBe(0);
		expect(state.prior_status.notnull).toBe(0);
		expect(state.last_error.notnull).toBe(0);
		expect(state.hidden_by_sync.notnull).toBe(1);
		expect(state.hidden_by_sync.dflt_value).toBe("0");
		expect(state.tab_name.notnull).toBe(0);

		const runs = await columns(db, "sync_runs");
		expect(Object.keys(runs).sort()).toEqual(
			[
				"id",
				"kind",
				"started_at",
				"finished_at",
				"created",
				"updated",
				"failed",
				"hidden",
				"unchanged",
				"notes",
			].sort(),
		);
		expect(runs.id.pk).toBe(1);
		expect(runs.unchanged.dflt_value).toBe("0");
		expect(runs.notes.notnull).toBe(0);
	});

	it("seeds sync_auto_publish true and keeps an owner-set false", async () => {
		const db = await freshMigratedDb();

		expect(await getValue(db, "sync_auto_publish")).toBe("true");

		await db
			.prepare("UPDATE settings SET value = ? WHERE key = ?")
			.bind("false", "sync_auto_publish")
			.run();

		await migrate(db);

		expect(await getValue(db, "sync_auto_publish")).toBe("false");
		expect(
			await count(db, "SELECT COUNT(*) AS n FROM settings WHERE key = ?", "sync_auto_publish"),
		).toBe(1);
	});

	it("all migrations twice are idempotent", async () => {
		const db = createFakeD1();

		// Each run must succeed (throws on failure).
		await migrate(db);
		await migrate(db);

		expect(
			await count(db, "SELECT COUNT(*) AS n FROM settings WHERE key = ?", "sync_auto_publish"),
		).toBe(1);
		expect(
			await count(
				db,
				"SELECT COUNT(*) AS n FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)",
				"service_fee_percent",
				"show_fee_note",
				"disclaimer_vi",
				"disclaimer_en",
				"data_version",
				"sync_auto_publish",
			),
		).toBe(6);
		expect(await count(db, "SELECT COUNT(*) AS n FROM settings")).toBe(6);
		expect(await count(db, "SELECT COUNT(*) AS n FROM sync_state")).toBe(0);
		expect(await count(db, "SELECT COUNT(*) AS n FROM sync_runs")).toBe(0);
	});
});
