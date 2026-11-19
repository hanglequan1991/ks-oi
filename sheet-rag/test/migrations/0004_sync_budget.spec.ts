import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

// Migrations are applied in order: 0001 creates the tables, 0002 seeds settings,
// 0003 adds sync, 0004 adds the tab check table and the per-file listing cache.
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
const BUDGET_SQL = readFileSync(
	new URL("../../migrations/0004_sync_budget.sql", import.meta.url),
	"utf8",
);

async function migrate(db: FakeD1): Promise<void> {
	await db.exec(INIT_SQL);
	await db.exec(SEED_SQL);
	await db.exec(SYNC_SQL);
	await db.exec(BUDGET_SQL);
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

describe("0004_sync_budget.sql", () => {
	it("0004 applies after 0001-0003, twice, and creates sync_tab_checks and sync_files", async () => {
		const db = createFakeD1();
		await migrate(db);

		// Re-running the whole chain must not fail and must keep the data already written.
		await db
			.prepare("INSERT INTO sync_tab_checks (tab_key, last_checked_at) VALUES (?, ?)")
			.bind("f1:0", "t1")
			.run();
		await db
			.prepare("INSERT INTO sync_files (file_id, file_name) VALUES (?, ?)")
			.bind("f1", "Da Nang")
			.run();
		await migrate(db);

		// sync_tab_checks: keyed by the tab key, with a required check time and two nullable meta columns.
		const checks = await columns(db, "sync_tab_checks");
		expect(Object.keys(checks).sort()).toEqual(
			["file_modified", "last_checked_at", "parser_version", "tab_key"],
		);
		expect(checks.tab_key.pk).toBe(1);
		expect(checks.tab_key.type).toBe("TEXT");
		expect(checks.last_checked_at.type).toBe("TEXT");
		expect(checks.last_checked_at.notnull).toBe(1);

		// sync_files: the per-file listing cache.
		const files = await columns(db, "sync_files");
		expect(Object.keys(files).sort()).toEqual(
			["file_id", "file_name", "modified", "skip_sig", "tabs_json", "listed_at"].sort(),
		);
		expect(files.file_id.pk).toBe(1);
		expect(files.file_name.notnull).toBe(0);
		expect(files.modified.notnull).toBe(0);
		expect(files.skip_sig.notnull).toBe(0);
		expect(files.tabs_json.notnull).toBe(0);
		expect(files.listed_at.notnull).toBe(0);

		// Data survived the second application: no duplicate and no reset.
		const checkRows = await db
			.prepare("SELECT tab_key, last_checked_at FROM sync_tab_checks")
			.all<{ tab_key: string; last_checked_at: string }>();
		expect(checkRows.results).toEqual([{ tab_key: "f1:0", last_checked_at: "t1" }]);
		const fileRows = await db.prepare("SELECT COUNT(*) AS n FROM sync_files").first<{ n: number }>();
		expect(Number(fileRows?.n)).toBe(1);

		// The migration does not alter sync_state (the check time lives in sync_tab_checks).
		const state = await columns(db, "sync_state");
		expect(state.last_checked_at).toBeUndefined();
	});

	it("0004 defines file_modified and parser_version and stays re-runnable", async () => {
		const db = createFakeD1();
		await migrate(db);

		// Both meta columns are nullable TEXT, and a row without them is legal.
		const checks = await columns(db, "sync_tab_checks");
		expect(checks.file_modified.type).toBe("TEXT");
		expect(checks.file_modified.notnull).toBe(0);
		expect(checks.parser_version.type).toBe("TEXT");
		expect(checks.parser_version.notnull).toBe(0);

		// A row with meta survives a second application of the whole chain.
		await db
			.prepare(
				"INSERT INTO sync_tab_checks (tab_key, last_checked_at, file_modified, parser_version) VALUES (?, ?, ?, ?)",
			)
			.bind("f1:0", "t1", "2026-11-01T00:00:00Z", "3")
			.run();
		await migrate(db);
		const row = await db
			.prepare("SELECT file_modified, parser_version FROM sync_tab_checks WHERE tab_key = ?")
			.bind("f1:0")
			.first<{ file_modified: string; parser_version: string }>();
		expect(row).toEqual({ file_modified: "2026-11-01T00:00:00Z", parser_version: "3" });
	});

	it("0004 contains no ALTER statement, so it is re-runnable", () => {
		expect(BUDGET_SQL).not.toMatch(/\bALTER\b/i);
	});
});
