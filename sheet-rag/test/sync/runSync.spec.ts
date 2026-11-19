import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { createFakeSheetSource, type FakeSheetSource } from "../fakes/sheetSource";
import { runSync, type ParseResult, type SyncDeps } from "../../src/sync/runSync";
import { startRun, getLatestRun } from "../../src/db/syncRuns";
import { hotelIdFor } from "../../src/sync/hash";
import { SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "../../src/sync/sheetSource";
import type { ParsedHotel } from "../../src/sync/record";

const NOW = "2026-11-19T10:00:00Z";
const LATER = "2026-11-19T11:00:00Z";
const SECRET_TOKEN = "SECRET-TOKEN-123";
const SECRET_ROW_TEXT = "SECRET-ROW-TEXT-XYZ";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/FILE-ID-99/export?format=csv&token=${SECRET_TOKEN}`;

const FILE: SheetFile = { fileId: "file-1", fileName: "Đà Nẵng" };
const TAB_A: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "1", tabName: "Biển Xanh" };
const TAB_B: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "2", tabName: "Sông Hàn" };
const TAB_C: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "3", tabName: "Mỹ Khê" };

// Stub CSV format used only by these tests: one `key=value` per line.
// `status=broken` makes the stub parser fail; `stars` and `price` feed the record.
function stubParse(csv: string): ParseResult {
	const fields = new Map<string, string>();
	for (const line of csv.split("\n")) {
		const at = line.indexOf("=");
		if (at > 0) fields.set(line.slice(0, at), line.slice(at + 1));
	}
	if (fields.get("status") === "broken") return { ok: false, reason: "stub_parse_failed" };
	const record: ParsedHotel = {
		stars: Number(fields.get("stars") ?? "4"),
		address: "12 Lê Lợi",
		area: "Hải Châu",
		descriptionVi: fields.get("desc") ?? "Mô tả",
		descriptionEn: null,
		images: [],
		facilities: ["Hồ bơi"],
		rooms: [{ name: "Deluxe", basePrice: Number(fields.get("price") ?? "1500000"), rules: [] }],
		hotelRules: [],
	};
	return { ok: true, record };
}

const csvOk = (price = "1500000") => `stars=4\ndesc=Mô tả\nprice=${price}`;

let db: FakeD1;
let source: FakeSheetSource;
type Db = SyncDeps["db"];
const asDb = (d: FakeD1): Db => d as unknown as Db;

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps {
	return { db: asDb(db), source, parse: stubParse, now: () => NOW, ...overrides };
}

async function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
	const { results } = await db.prepare(sql).bind(...params).all<T>();
	return results as T[];
}

async function hotelStatus(tab: SheetTab): Promise<string | null> {
	const id = await hotelIdFor(tab.fileId, tab.gid);
	const [row] = await rows<{ status: string }>("SELECT status FROM hotels WHERE id = ?", id);
	return row ? row.status : null;
}

async function stateOf(tab: SheetTab) {
	const [row] = await rows<Record<string, unknown>>(
		"SELECT * FROM sync_state WHERE source_file_id = ? AND source_gid = ?",
		tab.fileId,
		tab.gid,
	);
	return row;
}

async function dataVersion(): Promise<string> {
	const [row] = await rows<{ value: string }>("SELECT value FROM settings WHERE key = 'data_version'");
	return row.value;
}

async function hotelSyncedAt(tab: SheetTab): Promise<string | null> {
	const id = await hotelIdFor(tab.fileId, tab.gid);
	const [row] = await rows<{ synced_at: string }>("SELECT synced_at FROM hotels WHERE id = ?", id);
	return row ? row.synced_at : null;
}

function allTabsCsv(): Record<string, string> {
	return {
		[`file-1:1`]: csvOk("1500000"),
		[`file-1:2`]: csvOk("1200000"),
	};
}

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
	source = createFakeSheetSource({ files: [FILE], tabs: [TAB_A, TAB_B], csv: allTabsCsv() });
});

describe("runSync: first run, second run and edits", () => {
	it("first run creates hotels, second run changes nothing", async () => {
		const first = await runSync(deps());
		expect(first).toMatchObject({ created: 2, updated: 0, failed: 0, hidden: 0, unchanged: 0 });

		const versionAfterFirst = await dataVersion();
		const second = await runSync(deps());
		expect(second).toMatchObject({ created: 0, updated: 0, failed: 0, hidden: 0, unchanged: 2 });

		expect(await dataVersion()).toBe(versionAfterFirst);
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(TAB_B)).toBe("published");
	});

	it("editing one tab updates only that hotel", async () => {
		await runSync(deps());
		const syncedB = await hotelSyncedAt(TAB_B);

		source.csv["file-1:1"] = csvOk("1900000");
		const result = await runSync(deps({ now: () => LATER }));

		expect(result).toMatchObject({ created: 0, updated: 1, failed: 0, unchanged: 1 });
		expect(await hotelSyncedAt(TAB_A)).toBe(LATER);
		expect(await hotelSyncedAt(TAB_B)).toBe(syncedB);
	});

	it("sync_auto_publish 'false' creates hotels in review", async () => {
		await db.prepare("UPDATE settings SET value = 'false' WHERE key = 'sync_auto_publish'").run();
		await runSync(deps());
		expect(await hotelStatus(TAB_A)).toBe("review");
	});

	it("invalid tab reported, valid tab still synced", async () => {
		source.tabs.push(TAB_C);
		source.csv["file-1:3"] = "stars=9\ndesc=Mô tả\nprice=1000000";
		const broken: SheetTab = { ...TAB_C, gid: "4", tabName: "Hỏng" };
		source.tabs.push(broken);
		source.csv["file-1:4"] = "status=broken";

		const result = await runSync(deps());

		expect(result).toMatchObject({ created: 2, failed: 2 });
		expect(result.failures).toEqual([
			{ tab: "Mỹ Khê", reason: "stars_range" },
			{ tab: "Hỏng", reason: "stub_parse_failed" },
		]);
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(TAB_B)).toBe("published");
		expect(await hotelStatus(TAB_C)).toBeNull();

		const run = await getLatestRun(asDb(db));
		const notes = JSON.parse(run!.notes as string) as {
			items: Array<{ kind: string; tab?: string; reason?: string }>;
		};
		const failures = notes.items.filter((i) => i.kind === "failure");
		expect(failures.map((i) => [i.tab, i.reason])).toEqual([
			["Mỹ Khê", "stars_range"],
			["Hỏng", "stub_parse_failed"],
		]);
	});
});

describe("runSync: source failures", () => {
	it("listFiles or listTabs failure (and an empty-parse error) fails the run and hides nothing", async () => {
		await runSync(deps());
		const before = await rows("SELECT source_gid, missing_since, hidden_by_sync FROM sync_state ORDER BY source_gid");

		const failures: Array<[string, SheetSource]> = [
			["fake_list_failed", { ...source, listFiles: async () => { throw new SheetReadError("fake_list_failed"); } }],
			["folder_parse_empty", { ...source, listFiles: async () => { throw new SheetReadError("folder_parse_empty"); } }],
			["tab_list_parse_empty", { ...source, listTabs: async () => { throw new SheetReadError("tab_list_parse_empty"); } }],
		];

		for (const [code, failing] of failures) {
			const result = await runSync(deps({ source: failing, now: () => LATER }));
			expect(result.failed_run).toBe(true);
			expect(result.hidden).toBe(0);
			expect(result.failures).toEqual([{ tab: null, reason: code }]);
			expect(await hotelStatus(TAB_A)).toBe("published");
			expect(await hotelStatus(TAB_B)).toBe("published");
		}

		expect(await rows("SELECT source_gid, missing_since, hidden_by_sync FROM sync_state ORDER BY source_gid")).toEqual(before);
		const latest = await getLatestRun(asDb(db));
		expect(latest).toMatchObject({ failed: 1, finished_at: LATER });
	});

	it("a source that returns an empty tab list hides nothing", async () => {
		await runSync(deps());
		source.tabs.length = 0;

		const result = await runSync(deps({ now: () => LATER }));

		expect(result).toMatchObject({ hidden: 0, failed: 0, unchanged: 0 });
		expect(result.failed_run).toBeUndefined();
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(TAB_B)).toBe("published");
	});

	it("readCsv failure for one tab leaves its hotel alone", async () => {
		await runSync(deps());
		source.csv["file-1:2"] = csvOk("1800000");
		source.failRead = ["file-1:2"];

		const result = await runSync(deps({ now: () => LATER }));

		expect(result).toMatchObject({ created: 0, updated: 0, hidden: 0, failed: 1, unchanged: 1 });
		expect(result.failures).toEqual([{ tab: "Sông Hàn", reason: "fake_read_failed" }]);
		expect(await hotelStatus(TAB_B)).toBe("published");
		expect((await stateOf(TAB_B)).missing_since).toBeNull();
		expect((await stateOf(TAB_B)).hidden_by_sync).toBe(0);
	});
});

describe("runSync: removed and returned tabs", () => {
	it("removed tab hides the hotel, owner-hidden hotel untouched, tab returns restores", async () => {
		source.tabs.push(TAB_C);
		source.csv["file-1:3"] = csvOk("1100000");
		await runSync(deps());

		// The owner hides hotel C by hand.
		await db.prepare("UPDATE hotels SET status = 'hidden' WHERE id = ?").bind(await hotelIdFor("file-1", "3")).run();

		// Tabs B and C disappear from the sheet.
		source.tabs.splice(source.tabs.indexOf(TAB_B), 1);
		source.tabs.splice(source.tabs.indexOf(TAB_C), 1);
		const removed = await runSync(deps({ now: () => LATER }));

		expect(removed).toMatchObject({ hidden: 1, failed: 0 });
		expect(await hotelStatus(TAB_B)).toBe("hidden");
		expect(await hotelStatus(TAB_C)).toBe("hidden");
		expect(await stateOf(TAB_B)).toMatchObject({ hidden_by_sync: 1, prior_status: "published", missing_since: LATER });
		expect(await stateOf(TAB_C)).toMatchObject({ hidden_by_sync: 0, missing_since: LATER });

		// Tab B comes back: the hotel is restored to its prior status.
		source.tabs.push(TAB_B);
		const back = await runSync(deps({ now: () => "2026-11-19T12:00:00Z" }));

		expect(back).toMatchObject({ failed: 0 });
		expect(await hotelStatus(TAB_B)).toBe("published");
		expect(await stateOf(TAB_B)).toMatchObject({ hidden_by_sync: 0, prior_status: null, missing_since: null });
		// Hotel C is still hidden by the owner.
		expect(await hotelStatus(TAB_C)).toBe("hidden");
	});
});

describe("runSync: run log, concurrency and output", () => {
	it("run log counts are stored on the sync_runs row", async () => {
		source.tabs.push(TAB_C);
		source.csv["file-1:3"] = "stars=9\ndesc=Mô tả\nprice=1000000";
		const result = await runSync(deps());

		const run = await getLatestRun(asDb(db));
		expect(run).toMatchObject({
			kind: "manual",
			started_at: NOW,
			finished_at: NOW,
			created: result.created,
			updated: result.updated,
			failed: result.failed,
			hidden: result.hidden,
			unchanged: result.unchanged,
		});
		expect(run).toMatchObject({ created: 2, failed: 1 });
	});

	it("second concurrent run is skipped", async () => {
		await startRun(asDb(db), "scheduled", "2026-11-19T09:55:00Z");

		let listed = 0;
		const counting: SheetSource = {
			...source,
			listFiles: async () => {
				listed++;
				return source.listFiles();
			},
		};
		const result = await runSync(deps({ source: counting, now: () => NOW }));

		expect(result.skipped).toBe("already_running");
		expect(listed).toBe(0);
		expect(await rows("SELECT id FROM sync_runs")).toHaveLength(1);
		expect(await rows("SELECT * FROM sync_state")).toHaveLength(0);
	});

	it("a stale unfinished run (started 15 minutes or more ago) does not block", async () => {
		await startRun(asDb(db), "scheduled", "2026-11-19T09:40:00Z");
		const result = await runSync(deps({ now: () => NOW }));
		expect(result.skipped).toBeUndefined();
		expect(result).toMatchObject({ created: 2 });
	});

	it("notes contain no url or token", async () => {
		source.tabs.push(TAB_C);
		source.csv["file-1:3"] = csvOk();
		const failing: SheetSource = {
			...source,
			readCsv: async (tab: SheetTab) => {
				if (tab.gid === "3") throw new Error(`GET ${SHEET_URL} failed`);
				return source.readCsv(tab);
			},
		};
		const parsing = deps({
			source: failing,
			parse: (csv: string) => (csv.includes("broken") ? { ok: false, reason: SHEET_URL } : stubParse(csv)),
		});
		source.csv["file-1:2"] = "status=broken";

		await runSync(parsing);

		const notes = (await getLatestRun(asDb(db)))!.notes as string;
		expect(notes).not.toContain("https://");
		expect(notes).not.toContain(SECRET_TOKEN);
		expect(notes).not.toContain("docs.google.com");
	});

	it("returned summary has only counts and failure codes, no url, row text or secret", async () => {
		source.tabs.push(TAB_C);
		source.csv["file-1:3"] = `stars=9\ndesc=${SECRET_ROW_TEXT}\nprice=1000000`;
		const failing: SheetSource = {
			...source,
			readCsv: async (tab: SheetTab) => {
				if (tab.gid === "2") throw new Error(`fetch ${SHEET_URL}`);
				return source.readCsv(tab);
			},
		};

		const result = await runSync(deps({ source: failing }));
		const serialized = JSON.stringify(result);

		expect(serialized).not.toContain("https://");
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain(SECRET_ROW_TEXT);
		expect(serialized).not.toContain("FILE-ID-99");
		expect(serialized).not.toContain("file-1");
		expect(Object.keys(result).sort()).toEqual(
			["created", "failed", "failures", "hidden", "unchanged", "updated"].sort(),
		);
		for (const failure of result.failures) {
			expect(Object.keys(failure).sort()).toEqual(["reason", "tab"]);
		}
		expect(result.failures).toEqual([
			{ tab: "Sông Hàn", reason: "unexpected_error" },
			{ tab: "Mỹ Khê", reason: "stars_range" },
		]);
	});
});
