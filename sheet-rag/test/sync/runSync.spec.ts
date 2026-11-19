import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { createFakeSheetSource, type FakeSheetSource } from "../fakes/sheetSource";
import {
	runSync,
	TAB_APPLY_CALLS,
	TAB_FETCH_TRIES,
	TAB_RESERVE,
	type ParseResult,
	type SyncDeps,
} from "../../src/sync/runSync";
import { startRun, getLatestRun } from "../../src/db/syncRuns";
import { hotelIdFor } from "../../src/sync/hash";
import { SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "../../src/sync/sheetSource";
import type { ParsedHotel } from "../../src/sync/record";
import type { NetworkCause } from "../../src/sync/fetchErrors";
import { countingDb } from "../../src/sync/countingDb";
import {
	createSubrequestBudget,
	DEFAULT_MAX_TABS_PER_RUN,
	DEFAULT_SUBREQUEST_BUDGET,
	type SubrequestBudget,
} from "../../src/sync/budget";
import { syncHotel, type SyncHotelInput } from "../../src/sync/syncHotel";

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
		const FACILITY_LABEL = "CHỖ-ĐẬU-XE-NGẦM-QQ";
		const TAB_D: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "4", tabName: "Đường Sơn" };
		source.tabs.push(TAB_C, TAB_D);
		source.csv["file-1:3"] = `stars=4\ndesc=${SECRET_ROW_TEXT}\nprice=1000000`;
		source.csv["file-1:4"] = csvOk();

		// Hostile fixtures: a parse reason that is a URL, a parse that throws a URL and a secret,
		// a readCsv SheetReadError whose reason is a URL, and an unmapped facility label on tab A.
		const hostileParse = (csv: string, tab: SheetTab): ParseResult => {
			if (tab.gid === "2") return { ok: false, reason: SHEET_URL };
			if (tab.gid === "3") throw new Error(`parse ${SHEET_URL} ${SECRET_TOKEN} ${SECRET_ROW_TEXT}`);
			const parsed = stubParse(csv);
			if (parsed.ok) parsed.record.facilities = [FACILITY_LABEL];
			return parsed;
		};
		const hostileRead: SheetSource = {
			...source,
			readCsv: async (tab: SheetTab) => {
				if (tab.gid === "4") throw new SheetReadError(SHEET_URL);
				return source.readCsv(tab);
			},
		};

		const result = await runSync(deps({ source: hostileRead, parse: hostileParse }));
		const serialized = JSON.stringify(result);

		expect(serialized).not.toContain("https://");
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(serialized).not.toContain(SECRET_ROW_TEXT);
		expect(serialized).not.toContain("FILE-ID-99");
		expect(serialized).not.toContain("file-1");
		expect(serialized).not.toContain(FACILITY_LABEL);
		expect(Object.keys(result).sort()).toEqual(
			["created", "deferred", "failed", "failures", "hidden", "unchanged", "updated"].sort(),
		);
		for (const failure of result.failures) {
			expect(Object.keys(failure).sort()).toEqual(["reason", "tab"]);
		}
		expect(result).toMatchObject({ created: 1, failed: 3, hidden: 0, unchanged: 0 });
		expect(result.failures).toEqual([
			{ tab: "Đường Sơn", reason: "unexpected_error" },
			{ tab: "Sông Hàn", reason: "unexpected_error" },
			{ tab: "Mỹ Khê", reason: "unexpected_error" },
		]);

		// The facility label is kept in the run log notes only.
		const notes = (await getLatestRun(asDb(db)))!.notes as string;
		expect(notes).toContain(FACILITY_LABEL);
		expect(notes).not.toContain(SHEET_URL);
		expect(notes).not.toContain(SECRET_TOKEN);
		expect(notes).not.toContain(SECRET_ROW_TEXT);
	});

	it("listing errors carrying a url or secret return a failed run with only a code", async () => {
		await runSync(deps());
		const listFilesUrl: SheetSource = {
			...source,
			listFiles: async () => {
				throw new SheetReadError(SHEET_URL);
			},
		};
		const listTabsUrl: SheetSource = {
			...source,
			listTabs: async () => {
				throw new SheetReadError(`${SHEET_URL} ${SECRET_TOKEN}`);
			},
		};

		for (const hostile of [listFilesUrl, listTabsUrl]) {
			const result = await runSync(deps({ source: hostile, now: () => LATER }));
			const serialized = JSON.stringify(result);

			expect(result).toMatchObject({ failed_run: true, failed: 1, hidden: 0 });
			expect(result.failures).toEqual([{ tab: null, reason: "unexpected_error" }]);
			expect(serialized).not.toContain("https://");
			expect(serialized).not.toContain(SECRET_TOKEN);
			expect(serialized).not.toContain("file-1");
		}
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(TAB_B)).toBe("published");
	});
});

describe("runSync: removed tab hide is atomic", () => {
	it("a failing batch leaves the tab unmarked, so the next run hides it", async () => {
		await runSync(deps());
		source.tabs.splice(source.tabs.indexOf(TAB_B), 1);

		const failingDb = {
			...asDb(db),
			batch: async () => {
				throw new Error("D1 batch failed");
			},
		} as unknown as Db;
		const failed = await runSync(deps({ db: failingDb, now: () => LATER }));

		expect(failed).toMatchObject({ failed_run: true, hidden: 0 });
		expect(await hotelStatus(TAB_B)).toBe("published");
		expect(await stateOf(TAB_B)).toMatchObject({
			missing_since: null,
			hidden_by_sync: 0,
			prior_status: null,
		});

		const retry = await runSync(deps({ now: () => "2026-11-19T12:00:00Z" }));

		expect(retry).toMatchObject({ hidden: 1, failed: 0 });
		expect(await hotelStatus(TAB_B)).toBe("hidden");
		expect(await stateOf(TAB_B)).toMatchObject({
			hidden_by_sync: 1,
			prior_status: "published",
			missing_since: "2026-11-19T12:00:00Z",
		});
	});
});

// ---- TASK-68: stale-run abandon, wall-clock stop, circuit breaker ----

const MIN = 60_000;

async function runRow(id: string): Promise<Record<string, unknown>> {
	const [row] = await rows("SELECT * FROM sync_runs WHERE id = ?", id);
	return row;
}

/** Eight tabs of file-1, gids 1..8, each with a valid CSV. */
function eightTabs(): SheetTab[] {
	source.tabs.length = 0;
	for (let i = 1; i <= 8; i++) {
		source.tabs.push({ fileId: "file-1", fileName: "Đà Nẵng", gid: String(i), tabName: `Tab ${i}` });
		source.csv[`file-1:${i}`] = csvOk(String(1000000 + i));
	}
	return [...source.tabs];
}

/** A source whose readCsv records each read gid and throws the error `fault` returns, if any. */
function faultySource(fault: (tab: SheetTab) => SheetReadError | undefined, reads: string[]): SheetSource {
	return {
		...source,
		readCsv: async (tab: SheetTab) => {
			reads.push(tab.gid);
			const error = fault(tab);
			if (error) throw error;
			return source.readCsv(tab);
		},
	};
}

const netError = (cause: NetworkCause) => new SheetReadError(`csv_network_${cause}`, cause);

describe("runSync: stale runs are abandoned", () => {
	it("abandons a stale unfinished run older than 15 minutes and proceeds", async () => {
		const staleId = await startRun(asDb(db), "scheduled", "2026-11-19T09:30:00Z");

		const result = await runSync(deps());

		expect(result.skipped).toBeUndefined();
		expect(result).toMatchObject({ created: 2, failed: 0 });
		expect(await runRow(staleId)).toMatchObject({ finished_at: NOW, failed: 0 });
		expect(JSON.parse((await runRow(staleId)).notes as string)).toEqual({
			items: [{ kind: "error", reason: "abandoned" }],
			truncated: false,
		});
	});

	it("abandons several stale runs", async () => {
		const first = await startRun(asDb(db), "scheduled", "2026-11-19T08:00:00Z");
		const second = await startRun(asDb(db), "manual", "2026-11-19T09:30:00Z");

		const result = await runSync(deps());

		expect(result.skipped).toBeUndefined();
		for (const id of [first, second]) {
			expect(await runRow(id)).toMatchObject({ finished_at: NOW });
			expect(JSON.parse((await runRow(id)).notes as string).items).toEqual([{ kind: "error", reason: "abandoned" }]);
		}
		expect(await rows("SELECT id FROM sync_runs WHERE finished_at IS NULL")).toHaveLength(0);
	});

	it("recent unfinished run still skips with already_running", async () => {
		// Started 14 minutes before NOW: still inside the 15-minute window.
		const recentId = await startRun(asDb(db), "scheduled", "2026-11-19T09:46:00Z");

		const result = await runSync(deps());

		expect(result).toMatchObject({ skipped: "already_running", created: 0 });
		expect(await rows("SELECT id FROM sync_runs")).toHaveLength(1);
		expect(await runRow(recentId)).toMatchObject({ finished_at: null });
	});
});

describe("runSync: wall-clock deadline", () => {
	it("stops starting tabs after the soft or hard deadline and finishes the row", async () => {
		for (const elapsed of [9 * MIN, 11 * MIN]) {
			db = createFakeD1();
			await applyMigrations(db);
			eightTabs();
			let clock = 0;
			const reads: string[] = [];
			const slow = faultySource((tab) => {
				if (tab.gid === "1") clock = elapsed; // the first read takes the whole budget
				return undefined;
			}, reads);

			const result = await runSync(deps({ source: slow, nowMs: () => clock }));

			expect(reads).toEqual(["1"]);
			expect(result).toMatchObject({ aborted: "deadline", created: 1, failed: 0, hidden: 0 });
			const latest = await getLatestRun(asDb(db));
			expect(latest).toMatchObject({ finished_at: NOW });
			expect(JSON.parse(latest!.notes as string).items).toContainEqual({ kind: "abort", reason: "deadline" });
		}
	});
});

describe("runSync: circuit breaker", () => {
	it("five consecutive same-cause network failures trip the breaker", async () => {
		eightTabs();
		const reads: string[] = [];
		const failing = faultySource(() => netError("timeout"), reads);

		const result = await runSync(deps({ source: failing }));

		expect(reads).toEqual(["1", "2", "3", "4", "5"]);
		expect(result).toMatchObject({ aborted: "circuit_breaker", failed: 5, created: 0 });
		expect(result.failures).toHaveLength(5);
		const latest = await getLatestRun(asDb(db));
		expect(latest).toMatchObject({ finished_at: NOW, failed: 5 });
		expect(JSON.parse(latest!.notes as string).items).toContainEqual({ kind: "abort", reason: "aborted_circuit_breaker" });
	});

	it("streak resets on success, http failure and different cause", async () => {
		const scenarios: Array<(tab: SheetTab) => SheetReadError | undefined> = [
			(tab) => (tab.gid === "5" ? undefined : netError("timeout")), // success in the middle
			(tab) => (tab.gid === "5" ? new SheetReadError("csv_http_500") : netError("timeout")), // HTTP failure
			(tab) => (tab.gid === "5" ? netError("network_other") : netError("timeout")), // different cause
		];
		for (const fault of scenarios) {
			db = createFakeD1();
			await applyMigrations(db);
			source.tabs.length = 0;
			for (let i = 1; i <= 9; i++) {
				source.tabs.push({ fileId: "file-1", fileName: "Đà Nẵng", gid: String(i), tabName: `Tab ${i}` });
				source.csv[`file-1:${i}`] = csvOk();
			}
			const reads: string[] = [];

			const result = await runSync(deps({ source: faultySource(fault, reads) }));

			expect(reads).toHaveLength(9);
			expect(result.aborted).toBeUndefined();
		}
	});

	it("subrequest_limit and illegal_invocation trip the breaker on the first failure", async () => {
		for (const cause of ["subrequest_limit", "illegal_invocation"] as const) {
			db = createFakeD1();
			await applyMigrations(db);
			eightTabs();
			const reads: string[] = [];

			const result = await runSync(deps({ source: faultySource(() => netError(cause), reads) }));

			expect(reads).toEqual(["1"]);
			expect(result).toMatchObject({ aborted: "circuit_breaker", failed: 1 });
		}
	});

	it("early abort hides nothing and does not apply removed tabs", async () => {
		eightTabs();
		await runSync(deps());

		// Tab 1 disappears from the listing, and tabs 2..6 fail with the same cause.
		source.tabs.splice(0, 1);
		const reads: string[] = [];
		const failing = faultySource((tab) => (Number(tab.gid) >= 2 && Number(tab.gid) <= 6 ? netError("timeout") : undefined), reads);

		const result = await runSync(deps({ source: failing, now: () => LATER }));

		expect(result).toMatchObject({ aborted: "circuit_breaker", hidden: 0, failed: 5 });
		expect(reads).toEqual(["2", "3", "4", "5", "6"]);
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await stateOf(TAB_A)).toMatchObject({ missing_since: null, hidden_by_sync: 0 });
		expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(0);
	});

	it("summary and notes contain only codes after an abort", async () => {
		eightTabs();
		const hostile = faultySource(
			() => new SheetReadError(`${SHEET_URL} ${SECRET_TOKEN}`, "timeout"),
			[],
		);

		const result = await runSync(deps({ source: hostile }));
		const notes = (await getLatestRun(asDb(db)))!.notes as string;
		const serialized = JSON.stringify(result);

		expect(result.aborted).toBe("circuit_breaker");
		expect(serialized).not.toContain("http");
		expect(serialized).not.toContain("://");
		expect(serialized).not.toContain(SECRET_TOKEN);
		expect(notes).not.toContain("http");
		expect(notes).not.toContain("://");
		expect(notes).not.toContain(SECRET_TOKEN);
		expect(result.failures.every((f) => f.reason === "unexpected_error")).toBe(true);
	});
});

// ---- TASK-69: per-run tab cap, oldest-first order, subrequest budget, batched seen marks ----

const tabOf = (gid: number): SheetTab => ({
	fileId: "file-1",
	fileName: "Đà Nẵng",
	gid: String(gid),
	tabName: `Tab ${gid}`,
});

/** Replaces the source tabs with gids 1..n, each with a valid CSV. */
function fillTabs(n: number): void {
	source.tabs.length = 0;
	for (let i = 1; i <= n; i++) {
		source.tabs.push(tabOf(i));
		source.csv[`file-1:${i}`] = csvOk(String(1000000 + i));
	}
}

const sixtyTabs = (): void => fillTabs(60);

const range = (from: number, to: number): string[] =>
	Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/** Charges one subrequest per listing call and per read, like the real fetch wrapper does. */
function countingSource(src: SheetSource, budget: SubrequestBudget): SheetSource {
	return {
		...src,
		listFiles: async () => {
			budget.spend(1);
			return src.listFiles();
		},
		listTabs: async (file) => {
			budget.spend(1);
			return src.listTabs(file);
		},
		readCsv: async (tab) => {
			budget.spend(1);
			return src.readCsv(tab);
		},
	};
}

type SpyCall = { op: "run"; sql: string } | { op: "batch"; sql: string[] };

/** Records each statement run and each batch (by SQL text) on top of `base`. Results are unchanged. */
function spyDb(base: Db): { db: Db; calls: SpyCall[] } {
	const calls: SpyCall[] = [];
	const sqlOf = new WeakMap<object, string>();
	const innerOf = new WeakMap<object, D1PreparedStatement>();
	const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
		const proxy = new Proxy(statement, {
			get(target, prop) {
				if (prop === "bind") {
					return (...values: unknown[]) => wrap(target.bind(...values), sql);
				}
				if (prop === "run" || prop === "all" || prop === "first" || prop === "raw") {
					return (...args: unknown[]) => {
						calls.push({ op: "run", sql });
						return (target[prop] as (...a: unknown[]) => unknown)(...args);
					};
				}
				const value = Reflect.get(target, prop, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
		sqlOf.set(proxy, sql);
		innerOf.set(proxy, statement);
		return proxy;
	};
	const spied = new Proxy(base, {
		get(target, prop) {
			if (prop === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
			if (prop === "batch") {
				return (statements: D1PreparedStatement[]) => {
					calls.push({ op: "batch", sql: statements.map((s) => sqlOf.get(s) ?? "") });
					return target.batch(statements.map((s) => innerOf.get(s) ?? s));
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return { db: spied, calls };
}

const isSeenMark = (sql: string): boolean => sql.includes("last_seen_at, updated_at)");

describe("runSync: per-run tab cap, oldest-first, budget (TASK-69)", () => {
	it("reads only maxTabsPerRun tabs and reports deferred", async () => {
		sixtyTabs();
		const reads: string[] = [];

		const result = await runSync(
			deps({
				source: faultySource(() => undefined, reads),
				limits: { subrequestBudget: DEFAULT_SUBREQUEST_BUDGET, maxTabsPerRun: 25 },
			}),
		);

		expect(reads).toHaveLength(25);
		expect(result).toMatchObject({ created: 25, failed: 0, hidden: 0, deferred: 35 });
		expect(result.aborted).toBeUndefined();
		expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(0);
	});

	it("three runs converge over 60 tabs oldest-first", async () => {
		sixtyTabs();
		const runTimes = [NOW, LATER, "2026-11-19T12:00:00Z"];
		const runs: string[][] = [];

		for (const at of runTimes) {
			const reads: string[] = [];
			await runSync(deps({ source: faultySource(() => undefined, reads), now: () => at }));
			runs.push(reads);
		}

		expect(runs[0]).toEqual(range(1, 25));
		expect(runs[1]).toEqual(range(26, 50));
		// Run 3: the never-checked 51..60 first, then the oldest checked (gids 1..15, checked at NOW).
		expect(runs[2]).toHaveLength(25);
		expect(runs[2]).toEqual(expect.arrayContaining(range(51, 60)));
		expect(runs[2].filter((gid) => Number(gid) <= 50)).toEqual(range(1, 15));
		expect(new Set(runs.flat()).size).toBe(60);
	});

	it("marks listed tabs seen with batched calls only", async () => {
		sixtyTabs();
		const spy = spyDb(asDb(db));

		await runSync(deps({ db: spy.db }));

		const singleMarks = spy.calls.filter((c) => c.op === "run" && isSeenMark(c.sql));
		const markBatches = spy.calls.filter((c) => c.op === "batch" && c.sql.some(isSeenMark));
		const markedInBatches = markBatches.reduce(
			(n, c) => n + (c.op === "batch" ? c.sql.filter(isSeenMark).length : 0),
			0,
		);
		expect(singleMarks).toHaveLength(0);
		expect(markBatches.length).toBeLessThanOrEqual(2);
		expect(markedInBatches).toBe(60);
	});

	it("stops with budget_exhausted before exceeding the budget", async () => {
		sixtyTabs();
		const budget = createSubrequestBudget(DEFAULT_SUBREQUEST_BUDGET);

		const result = await runSync(
			deps({
				db: countingDb(asDb(db), budget),
				source: countingSource(source, budget),
				budget,
				limits: { subrequestBudget: DEFAULT_SUBREQUEST_BUDGET, maxTabsPerRun: 25 },
			}),
		);

		expect(result.aborted).toBe("budget_exhausted");
		expect(budget.used).toBeLessThanOrEqual(DEFAULT_SUBREQUEST_BUDGET);
		expect(result.created).toBeLessThan(25);
		expect(result.deferred).toBeGreaterThan(0);
		expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(0);
		const latest = await getLatestRun(asDb(db));
		expect(latest).toMatchObject({ finished_at: NOW });
		expect(JSON.parse(latest!.notes as string).items).toContainEqual({ kind: "abort", reason: "budget_exhausted" });
	});

	it("always finishes the run row on budget exhaustion", async () => {
		// 3 is below the fixed start-up cost, 40 runs out in the middle of the tabs.
		for (const limit of [3, DEFAULT_SUBREQUEST_BUDGET]) {
			db = createFakeD1();
			await applyMigrations(db);
			sixtyTabs();
			const budget = createSubrequestBudget(limit);

			const result = await runSync(
				deps({
					db: countingDb(asDb(db), budget),
					source: countingSource(source, budget),
					budget,
				}),
			);

			expect(result.aborted).toBe("budget_exhausted");
			expect(await rows("SELECT id FROM sync_runs WHERE finished_at IS NULL")).toHaveLength(0);
			const latest = await getLatestRun(asDb(db));
			expect(latest).toMatchObject({ finished_at: NOW });
			expect(JSON.parse(latest!.notes as string).items).toContainEqual({ kind: "abort", reason: "budget_exhausted" });
		}
	});

	it("unchanged tabs refresh last_checked_at in one batch, unreadable tabs do not", async () => {
		fillTabs(4);
		await runSync(deps({ now: () => NOW }));
		source.failRead.push("file-1:3");
		const spy = spyDb(asDb(db));

		const result = await runSync(deps({ db: spy.db, now: () => LATER }));

		expect(result).toMatchObject({ unchanged: 3, failed: 1, created: 0, updated: 0 });
		const checks = await rows<{ tab_key: string; last_checked_at: string }>(
			"SELECT tab_key, last_checked_at FROM sync_tab_checks ORDER BY tab_key",
		);
		expect(checks).toEqual([
			{ tab_key: "file-1:1", last_checked_at: LATER },
			{ tab_key: "file-1:2", last_checked_at: LATER },
			{ tab_key: "file-1:3", last_checked_at: NOW },
			{ tab_key: "file-1:4", last_checked_at: LATER },
		]);
		const checkBatches = spy.calls.filter(
			(c): c is { op: "batch"; sql: string[] } =>
				c.op === "batch" && c.sql.length > 0 && c.sql.every((s) => s.includes("sync_tab_checks")),
		);
		expect(checkBatches).toHaveLength(1);
		expect(checkBatches[0].sql).toHaveLength(3);
	});

	it("counts keep their meaning for processed tabs", async () => {
		fillTabs(3);
		source.csv["file-1:3"] = "status=broken";
		expect(await runSync(deps())).toMatchObject({ created: 2, updated: 0, failed: 1, unchanged: 0, hidden: 0 });

		source.csv["file-1:1"] = csvOk("1900000");
		const second = await runSync(deps({ now: () => LATER }));

		expect(second).toMatchObject({ created: 0, updated: 1, failed: 1, unchanged: 1, hidden: 0 });
		expect(second.failures).toEqual([{ tab: "Tab 3", reason: "stub_parse_failed" }]);
	});

	it("summary carries deferred as a number and no text", async () => {
		sixtyTabs();
		const result = await runSync(deps());

		for (const key of ["created", "updated", "failed", "hidden", "unchanged", "deferred"] as const) {
			expect(typeof result[key]).toBe("number");
		}
		expect(result.deferred).toBe(35);
		expect(JSON.stringify(result.deferred)).toMatch(/^\d+$/);

		// Listing failure and already_running also report deferred as a number (0).
		source.failList = true;
		expect(await runSync(deps())).toMatchObject({ deferred: 0 });
		source.failList = false;
		await startRun(asDb(db), "scheduled", "2026-11-19T09:50:00Z");
		expect(await runSync(deps())).toMatchObject({ skipped: "already_running", deferred: 0 });
	});

	it("defaults apply without limits or budget", async () => {
		sixtyTabs();
		expect(DEFAULT_MAX_TABS_PER_RUN).toBe(25);
		const reads: string[] = [];

		const result = await runSync(deps({ source: faultySource(() => undefined, reads) }));

		expect(reads).toHaveLength(25);
		expect(result).toMatchObject({ created: 25, deferred: 35 });
		expect(result.aborted).toBeUndefined();
	});

	it("deferred tabs are never hidden, truly removed tabs are", async () => {
		sixtyTabs();
		await runSync(deps()); // gids 1..25 created
		await runSync(deps({ now: () => LATER })); // gids 26..50 created, the rest deferred
		expect(await hotelStatus(tabOf(1))).toBe("published");
		expect(await hotelStatus(tabOf(40))).toBe("published");

		// Tab gid 5 (index 4) really disappears from the sheet.
		source.tabs.splice(4, 1);
		const result = await runSync(deps({ now: () => "2026-11-19T12:00:00Z" }));

		expect(result).toMatchObject({ hidden: 1, deferred: 34, failed: 0 });
		expect(await hotelStatus(tabOf(5))).toBe("hidden");
		for (const gid of [1, 2, 3, 4]) {
			expect(await hotelStatus(tabOf(gid))).toBe("published");
		}
		expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(1);
	});

	it("TAB_RESERVE matches the measured worst case of one applied tab", async () => {
		const recordOf = (price: string): ParsedHotel => {
			const parsed = stubParse(csvOk(price));
			if (!parsed.ok) throw new Error("fixture must parse");
			return parsed.record;
		};
		const noSetup = async (): Promise<void> => {};
		const createTabA = async (): Promise<void> => {
			await syncHotel(asDb(db), { tab: TAB_A, record: recordOf("1500000"), hash: "h1", now: NOW, autoPublish: true });
		};
		const failingBatch = (d: Db): Db =>
			new Proxy(d, {
				get(target, prop) {
					if (prop === "batch") return () => Promise.reject(new Error("batch failed"));
					const value = Reflect.get(target, prop, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});

		// Counts the D1 calls of one syncHotel call on a fresh database (setup is not counted).
		async function applyCost(
			setup: () => Promise<void>,
			input: SyncHotelInput,
			wrap: (d: Db) => Db = (d) => d,
		): Promise<number> {
			db = createFakeD1();
			await applyMigrations(db);
			await setup();
			const budget = createSubrequestBudget(Infinity);
			try {
				await syncHotel(countingDb(wrap(asDb(db)), budget), input);
			} catch {
				// A thrown apply still counts the calls it made.
			}
			return budget.used;
		}

		const costs = [
			await applyCost(noSetup, { tab: TAB_A, record: recordOf("1500000"), hash: "h1", now: NOW, autoPublish: true }),
			await applyCost(createTabA, { tab: TAB_A, record: recordOf("1900000"), hash: "h2", now: LATER, autoPublish: true }),
			await applyCost(createTabA, { tab: { ...TAB_A, gid: "9" }, record: recordOf("1500000"), hash: "h3", now: NOW, autoPublish: true }),
			await applyCost(noSetup, { tab: TAB_A, record: recordOf("1500000"), hash: "h1", now: NOW, autoPublish: true }, failingBatch),
		];

		expect(costs.every((c) => c > 0)).toBe(true);
		expect(TAB_FETCH_TRIES).toBe(3);
		expect(TAB_APPLY_CALLS).toBe(Math.max(...costs));
		expect(TAB_RESERVE).toBe(TAB_FETCH_TRIES + TAB_APPLY_CALLS);
	});
});
