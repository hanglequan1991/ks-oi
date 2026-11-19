import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

// Migrations are applied in order: 0001 creates the tables, 0002 seeds settings,
// 0003 adds sync, 0004 adds the sync budget columns and the per-file listing cache.
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
	it("0004 applies after 0001-0003 and adds last_checked_at and sync_files", async () => {
		const db = createFakeD1();
		await migrate(db);

		const state = await columns(db, "sync_state");
		expect(state.last_checked_at).toBeDefined();
		expect(state.last_checked_at.type).toBe("TEXT");
		expect(state.last_checked_at.notnull).toBe(0);
		expect(state.last_checked_at.dflt_value).toBeNull();
		// The existing columns are untouched.
		expect(state.last_seen_at).toBeDefined();
		expect(state.source_file_id.pk).toBe(1);
		expect(state.source_gid.pk).toBe(2);

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

		const rows = await db.prepare("SELECT COUNT(*) AS n FROM sync_files").first<{ n: number }>();
		expect(Number(rows?.n)).toBe(0);
	});
});
