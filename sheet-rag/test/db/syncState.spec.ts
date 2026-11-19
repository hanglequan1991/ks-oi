import { describe, expect, it, vi } from "vitest";
import {
	getSyncState,
	markTabMissing,
	markTabSeen,
	markTabsChecked,
	markTabsSeenBatch,
	pickOldestFirst,
	recordTabError,
	recordTabSuccess,
	tabCheckStatement,
	type SyncStateRow,
} from "../../src/db/syncState";
import { applyMigrations } from "../fakes/migrations";
import { createFakeD1, type FakeD1 } from "../fakes/d1";

async function migratedDb(): Promise<FakeD1> {
	const db = createFakeD1();
	await applyMigrations(db);
	return db;
}

const asD1 = (db: FakeD1) => db as unknown as D1Database;

describe("syncState db helpers", () => {
	it("syncState db helpers round trip on fake D1 with migrations", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "Hotel A", now: "t1" });
		let state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			source_file_id: "f1",
			source_gid: "0",
			tab_name: "Hotel A",
			last_seen_at: "t1",
			hash: null,
			last_error: null,
			missing_since: null,
		});

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h1",
			now: "t2",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			hotel_id: "hotel-a",
			hash: "h1",
			last_seen_at: "t2",
			last_error: null,
			missing_since: null,
		});

		// An error keeps the old hash and records the message.
		await recordTabError(d1, {
			fileId: "f1",
			gid: "0",
			tabName: "Hotel A",
			error: "csv_parse_failed",
			now: "t3",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			hash: "h1",
			last_error: "csv_parse_failed",
			hotel_id: "hotel-a",
		});

		// A later success clears the error.
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h2",
			now: "t4",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({ hash: "h2", last_error: null });

		// Missing marks the row with the time and prior status; a second mark keeps the first time.
		await markTabMissing(d1, "f1:0", "t5", "published");
		await markTabMissing(d1, "f1:0", "t6", "published");
		state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			missing_since: "t5",
			prior_status: "published",
		});

		// A success after missing clears missing_since (the tab came back).
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h2",
			now: "t7",
		});
		state = await getSyncState(d1);
		expect(state.get("f1:0")?.missing_since).toBeNull();
	});

	it("getSyncState returns an empty map when no rows exist", async () => {
		const db = await migratedDb();
		const state = await getSyncState(asD1(db));
		expect(state.size).toBe(0);
	});

	it("getSyncState returns last_checked_at, null for legacy rows", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		// A row written before the migration has no last_checked_at; the insert below omits it.
		await (d1)
			.prepare(
				"INSERT INTO sync_state (source_file_id, source_gid, tab_name, updated_at) VALUES (?, ?, ?, ?)",
			)
			.bind("f1", "legacy", "Old", "t0")
			.run();
		await markTabSeen(d1, { fileId: "f1", gid: "new", tabName: "New", now: "t1" });

		const state = await getSyncState(d1);
		expect(state.get("f1:legacy")?.last_checked_at).toBeNull();
		expect(state.get("f1:new")?.last_checked_at).toBeNull();

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "new",
			hotelId: "hotel-n",
			tabName: "New",
			hash: "h1",
			now: "t2",
		});
		expect((await getSyncState(d1)).get("f1:new")?.last_checked_at).toBe("t2");
	});

	it("getSyncState exposes file_modified and parser_version (null without a check row)", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);
		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "A", now: "t1" });
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "A",
			hash: "h1",
			now: "t2",
		});
		// Written without meta (no parserVersion), so the two columns stay null.
		let row = (await getSyncState(d1)).get("f1:0");
		expect(row?.file_modified).toBeNull();
		expect(row?.parser_version).toBeNull();

		// A tab with no check row at all: both are null.
		await markTabSeen(d1, { fileId: "f1", gid: "1", tabName: "B", now: "t1" });
		row = (await getSyncState(d1)).get("f1:1");
		expect(row?.file_modified).toBeNull();
		expect(row?.parser_version).toBeNull();

		// With meta: both come back.
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "A",
			hash: "h1",
			now: "t3",
			fileModified: "m1",
			parserVersion: "2",
		});
		row = (await getSyncState(d1)).get("f1:0");
		expect(row).toMatchObject({ file_modified: "m1", parser_version: "2" });
	});

	it("tabCheckStatement with meta stores columns; without meta keeps them; null round-trips", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);
		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "A", now: "t1" });

		await db.batch([
			tabCheckStatement(d1, { fileId: "f1", gid: "0" }, "t2", { fileModified: "m1", parserVersion: "2" }),
		]);
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			last_checked_at: "t2",
			file_modified: "m1",
			parser_version: "2",
		});

		// Without meta: last_checked_at moves, both columns keep their values.
		await db.batch([tabCheckStatement(d1, { fileId: "f1", gid: "0" }, "t3")]);
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			last_checked_at: "t3",
			file_modified: "m1",
			parser_version: "2",
		});

		// A null fileModified is stored as NULL.
		await db.batch([
			tabCheckStatement(d1, { fileId: "f1", gid: "0" }, "t4", { fileModified: null, parserVersion: "2" }),
		]);
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			last_checked_at: "t4",
			file_modified: null,
			parser_version: "2",
		});
	});

	it("markTabsChecked writes meta per key, leaves columns without meta, one batch", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);
		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "A", now: "t1" });
		await markTabSeen(d1, { fileId: "f1", gid: "1", tabName: "B", now: "t1" });
		await markTabSeen(d1, { fileId: "f9", gid: "9", tabName: "Z", now: "t1" });
		// f1:1 already has meta from an earlier successful check.
		await db.batch([
			tabCheckStatement(d1, { fileId: "f1", gid: "1" }, "t2", { fileModified: "old", parserVersion: "1" }),
		]);

		const batch = vi.spyOn(db, "batch");
		await markTabsChecked(d1, [
			{ fileId: "f1", gid: "0", meta: { fileModified: "m5", parserVersion: "2" } },
			{ fileId: "f1", gid: "1" }, // no meta: the old meta stays
			{ fileId: "f9", gid: "7", meta: { fileModified: "x", parserVersion: "2" } }, // no row: ignored
		], "t5");
		expect(batch).toHaveBeenCalledTimes(1);

		const state = await getSyncState(d1);
		expect(state.get("f1:0")).toMatchObject({
			last_checked_at: "t5",
			file_modified: "m5",
			parser_version: "2",
		});
		expect(state.get("f1:1")).toMatchObject({
			last_checked_at: "t5",
			file_modified: "old",
			parser_version: "1",
		});
		expect(state.has("f9:7")).toBe(false);

		batch.mockClear();
		await markTabsChecked(d1, [], "t6");
		expect(batch).not.toHaveBeenCalled();
	});

	it("recordTabSuccess stores fileModified and parserVersion when given, keeps them otherwise", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "A",
			hash: "h1",
			now: "t1",
			fileModified: "m1",
			parserVersion: "2",
		});
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			file_modified: "m1",
			parser_version: "2",
			last_checked_at: "t1",
		});

		// No meta given: the check time moves, the stored meta stays.
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "A",
			hash: "h2",
			now: "t2",
		});
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			file_modified: "m1",
			parser_version: "2",
			last_checked_at: "t2",
		});

		// A failed attempt never moves the stored meta.
		await recordTabError(d1, { fileId: "f1", gid: "0", tabName: "A", error: "boom", now: "t3" });
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			file_modified: "m1",
			parser_version: "2",
		});
	});

	it("markTabsChecked updates only the given tabs in one batch", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);
		await markTabSeen(d1, { fileId: "f1", gid: "0", tabName: "A", now: "t1" });
		await markTabSeen(d1, { fileId: "f1", gid: "1", tabName: "B", now: "t1" });
		await markTabSeen(d1, { fileId: "f2", gid: "0", tabName: "C", now: "t1" });

		const batch = vi.spyOn(db, "batch");
		await markTabsChecked(d1, [
			{ fileId: "f1", gid: "0" },
			{ fileId: "f2", gid: "0" },
			{ fileId: "f9", gid: "9" }, // no row: ignored
		], "t5");
		expect(batch).toHaveBeenCalledTimes(1);

		const state = await getSyncState(d1);
		// Only sync_tab_checks changes: sync_state.updated_at and last_seen_at stay as they were.
		expect(state.get("f1:0")).toMatchObject({ last_checked_at: "t5", updated_at: "t1", last_seen_at: "t1" });
		expect(state.get("f2:0")?.last_checked_at).toBe("t5");
		expect(state.get("f1:1")?.last_checked_at).toBeNull();
		expect(state.has("f9:9")).toBe(false);
		const checks = await db
			.prepare("SELECT tab_key FROM sync_tab_checks ORDER BY tab_key")
			.all<{ tab_key: string }>();
		expect(checks.results.map((r) => r.tab_key)).toEqual(["f1:0", "f2:0"]);

		// Empty input makes no D1 call.
		batch.mockClear();
		await markTabsChecked(d1, [], "t6");
		expect(batch).not.toHaveBeenCalled();
	});

	it("recordTabSuccess sets last_checked_at and recordTabError leaves it", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		const batch = vi.spyOn(db, "batch");
		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h1",
			now: "t1",
		});
		// The success row and the check upsert go in one batch.
		expect(batch).toHaveBeenCalledTimes(1);
		expect(batch.mock.calls[0][0]).toHaveLength(2);
		expect((await getSyncState(d1)).get("f1:0")?.last_checked_at).toBe("t1");

		await recordTabError(d1, {
			fileId: "f1",
			gid: "0",
			tabName: "Hotel A",
			error: "csv_parse_failed",
			now: "t2",
		});
		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			last_checked_at: "t1",
			last_error: "csv_parse_failed",
		});

		// A failing tab that has no row yet stays null.
		await recordTabError(d1, { fileId: "f1", gid: "1", tabName: "B", error: "x", now: "t2" });
		expect((await getSyncState(d1)).get("f1:1")?.last_checked_at).toBeNull();

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Hotel A",
			hash: "h2",
			now: "t3",
		});
		expect((await getSyncState(d1)).get("f1:0")?.last_checked_at).toBe("t3");
	});

	it("markTabsSeenBatch chunks 120 tabs into 3 batches and is a no-op for empty input", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		const batch = vi.spyOn(db, "batch");
		await markTabsSeenBatch(d1, [], "t1");
		expect(batch).not.toHaveBeenCalled();

		const tabs = Array.from({ length: 120 }, (_, i) => ({
			fileId: "f1",
			gid: String(i),
			tabName: `Tab ${i}`,
		}));
		await markTabsSeenBatch(d1, tabs, "t2");
		expect(batch).toHaveBeenCalledTimes(3);
		expect(batch.mock.calls.map((c) => c[0].length)).toEqual([50, 50, 20]);

		const state = await getSyncState(d1);
		expect(state.size).toBe(120);
		expect(state.get("f1:119")).toMatchObject({
			tab_name: "Tab 119",
			last_seen_at: "t2",
			updated_at: "t2",
		});
	});

	it("markTabsSeenBatch keeps hash, error and missing_since like markTabSeen", async () => {
		const db = await migratedDb();
		const d1 = asD1(db);

		await recordTabSuccess(d1, {
			fileId: "f1",
			gid: "0",
			hotelId: "hotel-a",
			tabName: "Old name",
			hash: "h1",
			now: "t1",
		});
		await recordTabError(d1, { fileId: "f1", gid: "0", tabName: "Old name", error: "boom", now: "t2" });
		await markTabMissing(d1, "f1:0", "t3", "published");

		await markTabsSeenBatch(d1, [{ fileId: "f1", gid: "0", tabName: "New name" }], "t4");

		expect((await getSyncState(d1)).get("f1:0")).toMatchObject({
			tab_name: "New name",
			last_seen_at: "t4",
			updated_at: "t4",
			hash: "h1",
			hotel_id: "hotel-a",
			last_error: "boom",
			missing_since: "t3",
			prior_status: "published",
			last_checked_at: "t1",
		});
	});

	it("pickOldestFirst orders never-checked first then oldest, stable, respects limit and reports deferred", () => {
		const tabs = [
			{ fileId: "f1", gid: "a" }, // checked t5
			{ fileId: "f1", gid: "b" }, // no row
			{ fileId: "f1", gid: "c" }, // checked t2
			{ fileId: "f1", gid: "d" }, // row with null last_checked_at
			{ fileId: "f1", gid: "e" }, // checked t5 (tie with a)
			{ fileId: "f1", gid: "f" }, // no row
		];
		const row = (gid: string, last: string | null): SyncStateRow => ({
			source_file_id: "f1",
			source_gid: gid,
			hotel_id: null,
			tab_name: null,
			hash: null,
			last_seen_at: null,
			missing_since: null,
			hidden_by_sync: 0,
			prior_status: null,
			last_error: null,
			updated_at: null,
			last_checked_at: last,
		});
		const state = new Map<string, SyncStateRow>([
			["f1:a", row("a", "t5")],
			["f1:c", row("c", "t2")],
			["f1:d", row("d", null)],
			["f1:e", row("e", "t5")],
		]);

		const all = pickOldestFirst(tabs, state, 10);
		expect(all.picked.map((t) => t.gid)).toEqual(["b", "d", "f", "c", "a", "e"]);
		expect(all.deferred).toBe(0);

		const limited = pickOldestFirst(tabs, state, 3);
		expect(limited.picked.map((t) => t.gid)).toEqual(["b", "d", "f"]);
		expect(limited.deferred).toBe(3);

		const none = pickOldestFirst(tabs, state, 0);
		expect(none.picked).toEqual([]);
		expect(none.deferred).toBe(6);

		expect(pickOldestFirst([], state, 5)).toEqual({ picked: [], deferred: 0 });
	});
});
