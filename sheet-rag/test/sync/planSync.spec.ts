import { describe, expect, it } from "vitest";
import type { SyncStateRow } from "../../src/db/syncState";
import { planSync } from "../../src/sync/planSync";
import type { SheetTab } from "../../src/sync/sheetSource";

const FILE = "file-1";

function tab(gid: string, name = `Hotel ${gid}`): SheetTab {
	return { fileId: FILE, fileName: "Hanoi.xlsx", gid, tabName: name };
}

function row(gid: string, overrides: Partial<SyncStateRow> = {}): SyncStateRow {
	return {
		source_file_id: FILE,
		source_gid: gid,
		hotel_id: `hotel-${gid}`,
		tab_name: `Hotel ${gid}`,
		hash: `hash-${gid}`,
		last_seen_at: "2026-11-18T00:00:00Z",
		missing_since: null,
		hidden_by_sync: 0,
		prior_status: null,
		last_error: null,
		updated_at: "2026-11-18T00:00:00Z",
		...overrides,
	};
}

function stateOf(...rows: SyncStateRow[]): Map<string, SyncStateRow> {
	return new Map(rows.map((r) => [`${r.source_file_id}:${r.source_gid}`, r]));
}

function hashesOf(entries: Record<string, string>): Map<string, string> {
	return new Map(Object.entries(entries).map(([gid, h]) => [`${FILE}:${gid}`, h]));
}

const gids = (tabs: SheetTab[]) => tabs.map((t) => t.gid);

describe("planSync", () => {
	it("new tab is changed", () => {
		const plan = planSync({
			tabs: [tab("1")],
			state: new Map(),
			hashes: hashesOf({ "1": "h1" }),
		});
		expect(gids(plan.changed)).toEqual(["1"]);
		expect(plan.unchanged).toEqual([]);
		expect(plan.removed).toEqual([]);
		expect(plan.restored).toEqual([]);
	});

	it("same hash is unchanged, different hash is changed, force marks all changed", () => {
		const tabs = [tab("1"), tab("2")];
		const state = stateOf(row("1"), row("2"));

		const same = planSync({
			tabs,
			state,
			hashes: hashesOf({ "1": "hash-1", "2": "hash-2" }),
		});
		expect(gids(same.changed)).toEqual([]);
		expect(gids(same.unchanged)).toEqual(["1", "2"]);

		const differs = planSync({
			tabs,
			state,
			hashes: hashesOf({ "1": "hash-1", "2": "other" }),
		});
		expect(gids(differs.changed)).toEqual(["2"]);
		expect(gids(differs.unchanged)).toEqual(["1"]);

		const forced = planSync({
			tabs,
			state,
			hashes: hashesOf({ "1": "hash-1", "2": "hash-2" }),
			force: true,
		});
		expect(gids(forced.changed)).toEqual(["1", "2"]);
		expect(forced.unchanged).toEqual([]);
	});

	it("tab with last_error and same hash is retried", () => {
		const plan = planSync({
			tabs: [tab("1")],
			state: stateOf(row("1", { last_error: "csv_parse_failed" })),
			hashes: hashesOf({ "1": "hash-1" }),
		});
		expect(gids(plan.changed)).toEqual(["1"]);
		expect(plan.unchanged).toEqual([]);
	});

	it("tab missing from list is removed, once", () => {
		const state = stateOf(row("1"), row("2"));
		const first = planSync({
			tabs: [tab("1")],
			state,
			hashes: hashesOf({ "1": "hash-1" }),
		});
		expect(first.removed.map((r) => r.source_gid)).toEqual(["2"]);
		expect(gids(first.changed)).toEqual([]);

		// After the caller marks it missing, the next run no longer reports it.
		const alreadyMissing = stateOf(row("1"), row("2", { missing_since: "2026-11-18T01:00:00Z" }));
		const second = planSync({
			tabs: [tab("1")],
			state: alreadyMissing,
			hashes: hashesOf({ "1": "hash-1" }),
		});
		expect(second.removed).toEqual([]);
	});

	it("returning tab is restored and changed", () => {
		const plan = planSync({
			tabs: [tab("1")],
			state: stateOf(row("1", { missing_since: "2026-11-18T01:00:00Z" })),
			hashes: hashesOf({ "1": "hash-1" }),
		});
		expect(gids(plan.restored)).toEqual(["1"]);
		expect(gids(plan.changed)).toEqual(["1"]);
		expect(plan.unchanged).toEqual([]);
		expect(plan.removed).toEqual([]);
	});

	it("empty tab list removes nothing", () => {
		const plan = planSync({
			tabs: [],
			state: stateOf(row("1"), row("2")),
			hashes: new Map(),
		});
		expect(plan.removed).toEqual([]);
		expect(plan.changed).toEqual([]);
		expect(plan.unchanged).toEqual([]);
		expect(plan.restored).toEqual([]);
	});

	it("only the edited tab is changed among three", () => {
		const tabs = [tab("1"), tab("2"), tab("3")];
		const state = stateOf(row("1"), row("2"), row("3"));
		const plan = planSync({
			tabs,
			state,
			hashes: hashesOf({ "1": "hash-1", "2": "edited", "3": "hash-3" }),
		});
		expect(gids(plan.changed)).toEqual(["2"]);
		expect(gids(plan.unchanged)).toEqual(["1", "3"]);
		expect(plan.removed).toEqual([]);

		// Re-running with the stored hashes gives no changes at all.
		const rerun = planSync({
			tabs,
			state,
			hashes: hashesOf({ "1": "hash-1", "2": "hash-2", "3": "hash-3" }),
		});
		expect(rerun.changed).toEqual([]);
	});
});
