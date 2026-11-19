// Read-skip of runSync (STORY-14, TASK-73): a tab whose Drive modified text, parser version and state
// are unchanged, and whose last check is fresh, is not read. Fake D1 with the real migrations, injected
// clock, counting wrappers for the D1 calls and the fetches.
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import {
	PARSER_VERSION,
	runSync,
	SKIP_MAX_AGE_MS,
	type ParseResult,
	type SyncDeps,
	type SyncOptions,
	type SyncSummary,
} from "../../src/sync/runSync";
import { countingDb } from "../../src/sync/countingDb";
import { createSubrequestBudget, type SubrequestBudget } from "../../src/sync/budget";
import { SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "../../src/sync/sheetSource";
import type { ParsedHotel } from "../../src/sync/record";
import { hotelIdFor } from "../../src/sync/hash";

const NOW = "2026-11-19T10:00:00Z";
const LATER = "2026-11-19T11:00:00Z";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BIG_LIMITS = { subrequestBudget: Infinity, maxTabsPerRun: 500 };

type Db = SyncDeps["db"];
const asDb = (d: FakeD1): Db => d as unknown as Db;

let db: FakeD1;

interface Data {
	files: SheetFile[];
	tabs: SheetTab[];
	csv: Record<string, string>;
	/** Keys (`fileId:gid`) whose readCsv throws. */
	failRead: Set<string>;
	/** When true, listFiles throws. */
	failList: boolean;
	/** Called on every readCsv, before the csv is returned (used to edit the folder mid-run). */
	onRead?: (tab: SheetTab) => void;
}

interface Log {
	listFiles: number;
	listTabs: string[];
	readCsv: string[];
}

const newLog = (): Log => ({ listFiles: 0, listTabs: [], readCsv: [] });

/** A source over plain data. Charges `fetches` once per listFiles, listTabs and readCsv call. */
function sourceOf(data: Data, log: Log, fetches?: SubrequestBudget): SheetSource {
	return {
		async listFiles() {
			fetches?.spend(1);
			log.listFiles++;
			if (data.failList) throw new SheetReadError("fake_list_failed");
			return data.files.map((f) => ({ ...f }));
		},
		async listTabs(file) {
			fetches?.spend(1);
			log.listTabs.push(file.fileId);
			return data.tabs.filter((t) => t.fileId === file.fileId).map((t) => ({ ...t }));
		},
		async readCsv(tab) {
			fetches?.spend(1);
			const key = `${tab.fileId}:${tab.gid}`;
			log.readCsv.push(key);
			data.onRead?.(tab);
			if (data.failRead.has(key)) throw new SheetReadError("fake_read_failed");
			const csv = data.csv[key];
			if (csv === undefined) throw new SheetReadError("fake_csv_missing");
			return csv;
		},
	};
}

// Stub CSV format: one `key=value` per line. `status=broken` fails the parse; `stars` feeds the record.
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

const FILE: SheetFile = { fileId: "file-1", fileName: "Đà Nẵng", modified: "m1" };
const TAB_A: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "1", tabName: "Biển Xanh" };
const TAB_B: SheetTab = { fileId: "file-1", fileName: "Đà Nẵng", gid: "2", tabName: "Sông Hàn" };
const KEY_A = "file-1:1";
const KEY_B = "file-1:2";

/** `count` tabs of one file, gids 1..count. */
function tabsOf(count: number, fileId = "file-1", fileName = "Đà Nẵng", gidFrom = 1): SheetTab[] {
	const tabs: SheetTab[] = [];
	for (let i = gidFrom; i < gidFrom + count; i++) {
		tabs.push({ fileId, fileName, gid: String(i), tabName: `Khách sạn ${fileId} ${i}` });
	}
	return tabs;
}

function freshData(): Data {
	return {
		files: [{ ...FILE }],
		tabs: [{ ...TAB_A }, { ...TAB_B }],
		csv: { [KEY_A]: csvOk("1500000"), [KEY_B]: csvOk("1200000") },
		failRead: new Set(),
		failList: false,
	};
}

let data: Data;

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
	data = freshData();
});

/** One run with the given clock. The source and the db can be replaced through `extra`. */
async function run(
	at: string,
	opts: SyncOptions = {},
	extra: Partial<SyncDeps> = {},
): Promise<{ summary: SyncSummary; log: Log }> {
	const log = newLog();
	const summary = await runSync(
		{
			db: asDb(db),
			source: sourceOf(data, log),
			parse: stubParse,
			now: () => at,
			nowMs: () => Date.parse(at),
			limits: BIG_LIMITS,
			...extra,
		},
		opts,
	);
	return { summary, log };
}

/** Default limits (cap 25) for runs that test the cap itself. */
async function runCapped(at: string, opts: SyncOptions = {}): Promise<{ summary: SyncSummary; log: Log }> {
	const log = newLog();
	const summary = await runSync(
		{
			db: asDb(db),
			source: sourceOf(data, log),
			parse: stubParse,
			now: () => at,
			nowMs: () => Date.parse(at),
		},
		opts,
	);
	return { summary, log };
}

async function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
	const { results } = await db.prepare(sql).bind(...params).all<T>();
	return results as T[];
}

async function exec(sql: string, ...params: unknown[]): Promise<void> {
	await db.prepare(sql).bind(...params).run();
}

interface CheckRow {
	file_modified: string | null;
	parser_version: string | null;
	last_checked_at: string | null;
}

async function checkOf(tab: SheetTab): Promise<CheckRow | undefined> {
	const [row] = await rows<CheckRow>(
		"SELECT file_modified, parser_version, last_checked_at FROM sync_tab_checks WHERE tab_key = ?",
		`${tab.fileId}:${tab.gid}`,
	);
	return row;
}

async function stateOf(tab: SheetTab): Promise<Record<string, unknown> | undefined> {
	const [row] = await rows<Record<string, unknown>>(
		"SELECT * FROM sync_state WHERE source_file_id = ? AND source_gid = ?",
		tab.fileId,
		tab.gid,
	);
	return row;
}

async function hotelStatus(tab: SheetTab): Promise<string | null> {
	const id = await hotelIdFor(tab.fileId, tab.gid);
	const [row] = await rows<{ status: string }>("SELECT status FROM hotels WHERE id = ?", id);
	return row ? row.status : null;
}

/** An ISO time `ms` after NOW. */
const after = (ms: number): string => new Date(Date.parse(NOW) + ms).toISOString();

/** Warm cache: both tabs read and stored at NOW with file modified "m1" and the current parser version. */
async function warm(): Promise<void> {
	const first = await run(NOW);
	expect(first.summary).toMatchObject({ created: 2, failed: 0 });
}

/**
 * A flaky db: prepare throws for the SQL that `shouldFail` matches. Used to make syncHotel fail inside
 * its try block (apply_failed) without failing the batches of the run.
 */
function flakyDb(fake: FakeD1, shouldFail: (sql: string) => boolean): Db {
	return new Proxy(fake, {
		get(target, prop) {
			if (prop === "prepare") {
				return (sql: string) => {
					if (shouldFail(sql)) throw new Error("boom");
					return target.prepare(sql);
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as unknown as Db;
}

describe("runSync read-skip: skip rule (TASK-73 AC1)", () => {
	it("exports a 7 day age cap", () => {
		expect(SKIP_MAX_AGE_MS).toBe(MAX_AGE_MS);
	});

	it("skips readCsv for an unchanged clean tab and counts it unchanged", async () => {
		await warm();
		const before = await checkOf(TAB_A);

		const { summary, log } = await run(LATER);

		expect(log.readCsv).toEqual([]);
		expect(summary).toMatchObject({ created: 0, updated: 0, failed: 0, hidden: 0, unchanged: 2, deferred: 0 });
		// The skipped tab makes no write of its own: its check time is still the warm-up time.
		expect(await checkOf(TAB_A)).toEqual(before);
		expect(before?.last_checked_at).toBe(NOW);
	});

	it("skips a tab checked just under MAX_AGE_MS ago", async () => {
		await warm();
		const { log, summary } = await run(after(MAX_AGE_MS - 60_000));
		expect(log.readCsv).toEqual([]);
		expect(summary.unchanged).toBe(2);
	});
});

describe("runSync read-skip: every condition that forces a read (TASK-73 AC2)", () => {
	interface Case {
		name: string;
		setup: () => Promise<void> | void;
		at?: string;
		opts?: SyncOptions;
		/** Keys read this run (the rest are skipped). */
		reads: string[];
	}

	const cases: Case[] = [
		{
			name: "file modified changed",
			setup: () => {
				data.files[0].modified = "m2";
			},
			reads: [KEY_A, KEY_B],
		},
		{
			name: "file modified undefined",
			setup: () => {
				data.files = [{ fileId: FILE.fileId, fileName: FILE.fileName }];
			},
			reads: [KEY_A, KEY_B],
		},
		{
			name: "file modified null",
			setup: () => {
				data.files = [{ ...FILE, modified: null as unknown as string }];
			},
			reads: [KEY_A, KEY_B],
		},
		{
			name: "file modified empty text",
			setup: () => {
				data.files[0].modified = "";
			},
			reads: [KEY_A, KEY_B],
		},
		{
			name: "no stored file_modified",
			setup: () => exec("UPDATE sync_tab_checks SET file_modified = NULL"),
			reads: [KEY_A, KEY_B],
		},
		{
			name: "stored parser_version differs",
			setup: () => exec("UPDATE sync_tab_checks SET parser_version = '0' WHERE tab_key = ?", KEY_A),
			reads: [KEY_A],
		},
		{
			name: "stored parser_version null",
			setup: () => exec("UPDATE sync_tab_checks SET parser_version = NULL WHERE tab_key = ?", KEY_A),
			reads: [KEY_A],
		},
		{
			name: "no check row at all",
			setup: () => exec("DELETE FROM sync_tab_checks WHERE tab_key = ?", KEY_A),
			reads: [KEY_A],
		},
		{
			name: "last_error set",
			setup: () => exec("UPDATE sync_state SET last_error = 'stub_parse_failed' WHERE source_gid = '1'"),
			reads: [KEY_A],
		},
		{
			name: "missing_since set",
			setup: () => exec("UPDATE sync_state SET missing_since = ? WHERE source_gid = '1'", NOW),
			reads: [KEY_A],
		},
		{
			name: "no stored hash",
			setup: () => exec("UPDATE sync_state SET hash = NULL WHERE source_gid = '1'"),
			reads: [KEY_A],
		},
		{
			name: "last_checked_at older than MAX_AGE_MS",
			setup: () => undefined,
			at: after(MAX_AGE_MS + 3_600_000),
			reads: [KEY_A, KEY_B],
		},
		{
			name: "last_checked_at exactly MAX_AGE_MS ago",
			setup: () => undefined,
			at: after(MAX_AGE_MS),
			reads: [KEY_A, KEY_B],
		},
		{
			name: "force",
			setup: () => undefined,
			opts: { force: true },
			reads: [KEY_A, KEY_B],
		},
	];

	for (const testCase of cases) {
		it(`reads when ${testCase.name}`, async () => {
			await warm();
			await testCase.setup();

			const { log } = await run(testCase.at ?? LATER, testCase.opts ?? {});

			expect([...log.readCsv].sort()).toEqual([...testCase.reads].sort());
		});
	}
});

describe("runSync read-skip: cap and removal (TASK-73 AC3, AC6)", () => {
	it("skipped tabs do not use the per-run cap", async () => {
		data.tabs = tabsOf(40);
		data.csv = {};
		for (const tab of data.tabs) data.csv[`file-1:${tab.gid}`] = csvOk();
		await run(NOW);

		// Gids 31..40 are made non-skippable with a stored error; the other 30 stay clean.
		for (let gid = 31; gid <= 40; gid++) {
			await exec("UPDATE sync_state SET last_error = 'stub_parse_failed' WHERE source_gid = ?", String(gid));
		}

		const { summary, log } = await runCapped(LATER);

		expect([...log.readCsv].sort()).toEqual(
			Array.from({ length: 10 }, (_, i) => `file-1:${31 + i}`).sort(),
		);
		expect(summary).toMatchObject({ updated: 10, failed: 0, unchanged: 30, deferred: 0 });
	});

	it("a skipped tab present in the listing is never hidden or marked missing", async () => {
		await warm();
		const { summary } = await run(LATER);

		expect(summary.hidden).toBe(0);
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(TAB_B)).toBe("published");
		expect((await stateOf(TAB_A))?.missing_since).toBeNull();
		expect((await stateOf(TAB_B))?.missing_since).toBeNull();
	});

	it("a tab absent from a complete listing is still hidden, a skipped one is not", async () => {
		// The removed tab lives in a second file, so the first file stays skippable (its listing is cached).
		const GONE: SheetTab = { fileId: "file-2", fileName: "Hội An", gid: "1", tabName: "Phố Cổ" };
		data.files = [{ ...FILE }, { fileId: "file-2", fileName: "Hội An", modified: "n1" }];
		data.tabs = [{ ...TAB_A }, { ...GONE }];
		data.csv = { [KEY_A]: csvOk(), "file-2:1": csvOk() };
		const warmed = await run(NOW);
		expect(warmed.summary.created).toBe(2);

		// File two changes and no longer lists its tab: its listing is fresh and complete.
		data.files[1].modified = "n2";
		data.tabs = [{ ...TAB_A }];

		const { summary, log } = await run(LATER);

		expect(summary.hidden).toBe(1);
		expect(log.readCsv).toEqual([]);
		expect(await hotelStatus(TAB_A)).toBe("published");
		expect(await hotelStatus(GONE)).toBe("hidden");
		expect((await stateOf(GONE))?.missing_since).toBe(LATER);
		expect((await stateOf(TAB_A))?.missing_since).toBeNull();
	});

	it("an owner-hidden hotel of a skipped tab is never un-hidden", async () => {
		await warm();
		const id = await hotelIdFor(TAB_A.fileId, TAB_A.gid);
		await exec("UPDATE hotels SET status = 'hidden' WHERE id = ?", id);

		const { log } = await run(LATER);

		expect(log.readCsv).toEqual([]);
		expect(await hotelStatus(TAB_A)).toBe("hidden");
		expect((await stateOf(TAB_A))?.hidden_by_sync).toBe(0);
	});

	it("a failed listing marks nothing removed and skips nothing else", async () => {
		await warm();
		data.failList = true;

		const { summary, log } = await run(LATER);

		expect(summary).toMatchObject({ failed: 1, hidden: 0, failed_run: true });
		expect(log.readCsv).toEqual([]);
		expect((await stateOf(TAB_B))?.missing_since).toBeNull();
	});
});

describe("runSync read-skip: stored values (TASK-73 AC4, AC5)", () => {
	it("stores file_modified and parser_version after an unchanged read", async () => {
		await warm();
		data.files[0].modified = "m2";

		const { summary, log } = await run(LATER);

		expect([...log.readCsv].sort()).toEqual([KEY_A, KEY_B]);
		expect(summary.unchanged).toBe(2);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m2", parser_version: PARSER_VERSION });
		expect(await checkOf(TAB_B)).toMatchObject({ file_modified: "m2", parser_version: PARSER_VERSION });
	});

	it("stores file_modified and parser_version after an applied tab", async () => {
		await warm();
		data.files[0].modified = "m2";
		data.csv[KEY_A] = csvOk("1900000");

		const { summary } = await run(LATER);

		expect(summary).toMatchObject({ updated: 1, unchanged: 1, failed: 0 });
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m2", parser_version: PARSER_VERSION });
	});

	it("keeps the stored file_modified after a read failure", async () => {
		await warm();
		data.files[0].modified = "m2";
		data.failRead.add(KEY_A);

		const { summary } = await run(LATER);

		expect(summary.failed).toBe(1);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m1", parser_version: PARSER_VERSION });
	});

	it("keeps the stored file_modified after a parse failure", async () => {
		await warm();
		data.files[0].modified = "m2";
		data.csv[KEY_A] = "status=broken";

		const { summary } = await run(LATER);

		expect(summary.failed).toBe(1);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m1" });
	});

	it("keeps the stored file_modified after an invalid record", async () => {
		await warm();
		data.files[0].modified = "m2";
		data.csv[KEY_A] = "stars=9\ndesc=Mô tả\nprice=1500000";

		const { summary } = await run(LATER);

		expect(summary.failed).toBe(1);
		expect(summary.failures).toEqual([{ tab: TAB_A.tabName, reason: "stars_range" }]);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m1" });
	});

	it("keeps the stored file_modified after an apply failure", async () => {
		await warm();
		data.files[0].modified = "m2";
		data.csv[KEY_A] = csvOk("1900000");
		const flaky = flakyDb(db, (sql) => sql.includes("SELECT slug, status FROM hotels"));

		const { summary } = await run(LATER, {}, { db: flaky });

		expect(summary.failures).toEqual([{ tab: TAB_A.tabName, reason: "apply_failed" }]);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m1" });
	});

	it("stores the file modified text seen at listing time, not a newer one", async () => {
		data.onRead = (tab) => {
			if (tab.gid === "1") data.files[0].modified = "m2";
		};
		const first = await run(NOW);
		expect(first.summary.created).toBe(2);
		expect(await checkOf(TAB_A)).toMatchObject({ file_modified: "m1" });
		expect(await checkOf(TAB_B)).toMatchObject({ file_modified: "m1" });

		// The edit made during the run is seen next run: both tabs are read again.
		data.onRead = undefined;
		const second = await run(LATER);
		expect([...second.log.readCsv].sort()).toEqual([KEY_A, KEY_B]);
	});
});

describe("runSync read-skip: idle run cost (TASK-73 AC7)", () => {
	/** Warms `count` tabs in one file, then runs one idle run and returns its fetch and D1 counts. */
	async function idleRun(count: number) {
		data.tabs = tabsOf(count);
		data.csv = {};
		for (const tab of data.tabs) data.csv[`file-1:${tab.gid}`] = csvOk();
		const warmRun = await run(NOW);
		expect(warmRun.summary.created).toBe(count);

		const fetches = createSubrequestBudget(Infinity);
		const d1Calls = createSubrequestBudget(Infinity);
		const log = newLog();
		const summary = await runSync(
			{
				db: countingDb(asDb(db), d1Calls),
				source: sourceOf(data, log, fetches),
				parse: stubParse,
				now: () => LATER,
				nowMs: () => Date.parse(LATER),
				limits: BIG_LIMITS,
			},
			{},
		);
		return { summary, log, fetches: fetches.used, d1Calls: d1Calls.used };
	}

	it("idle run with at most 50 tabs costs one fetch and at most 8 D1 calls", async () => {
		const result = await idleRun(50);

		expect(result.fetches).toBe(1);
		expect(result.log.listTabs).toEqual([]);
		expect(result.log.readCsv).toEqual([]);
		expect(result.summary.unchanged).toBe(50);
		expect(result.d1Calls).toBeLessThanOrEqual(8);
		// Measured: 7 (run log read, run insert, file cache read, state read, seen batch, auto-publish read, finish).
		expect(result.d1Calls).toBe(7);
	});

	it("idle run with 450 tabs costs one fetch and at most 7 + ceil(tabs / 50) D1 calls", async () => {
		const result = await idleRun(450);

		const tabs = 450;
		expect(result.fetches).toBe(1);
		expect(result.log.listTabs).toEqual([]);
		expect(result.log.readCsv).toEqual([]);
		expect(result.summary.unchanged).toBe(tabs);
		expect(result.d1Calls).toBeLessThanOrEqual(7 + Math.ceil(tabs / 50));
		// Measured: 6 + ceil(tabs / 50) = 15. markTabsChecked makes no call with no keys.
		expect(result.d1Calls).toBe(6 + Math.ceil(tabs / 50));
	});
});

describe("runSync read-skip: convergence (TASK-73 AC8)", () => {
	const CAP = 25;
	const FILES = 3;
	const PER_FILE = 150;

	it("cold folder converges to an idle run; a changed file re-reads only its tabs", async () => {
		data.files = Array.from({ length: FILES }, (_, i) => ({
			fileId: `f${i + 1}`,
			fileName: `City ${i + 1}`,
			modified: `m${i + 1}`,
		}));
		data.tabs = [];
		data.csv = {};
		for (let f = 1; f <= FILES; f++) {
			const tabs = tabsOf(PER_FILE, `f${f}`, `City ${f}`);
			data.tabs.push(...tabs);
			for (const tab of tabs) data.csv[`f${f}:${tab.gid}`] = csvOk();
		}

		let hour = 0;
		const next = (): string => after(++hour * 3_600_000);
		const readsOf = async (): Promise<string[]> => {
			const { log } = await runCapped(next(), {});
			return log.readCsv;
		};

		// Cold: every run reads at most the cap, oldest first, until every tab has been checked.
		const coldReads: string[] = [];
		let coldRuns = 0;
		for (;;) {
			const reads = await readsOf();
			coldRuns++;
			expect(reads.length).toBeLessThanOrEqual(CAP);
			if (reads.length === 0) break;
			coldReads.push(...reads);
			if (coldRuns > 50) throw new Error("did not converge");
		}
		expect(new Set(coldReads).size).toBe(FILES * PER_FILE);
		expect(coldReads.length).toBe(FILES * PER_FILE);
		expect(coldRuns).toBe((FILES * PER_FILE) / CAP + 1);

		// Converged: the next run is idle as well.
		expect(await readsOf()).toEqual([]);

		// One file changes: only its tabs are read, in capped batches, and then the run is idle again.
		data.files[1].modified = "m2-new";
		const changedReads: string[] = [];
		for (;;) {
			const reads = await readsOf();
			if (reads.length === 0) break;
			changedReads.push(...reads);
		}
		expect(changedReads.length).toBe(PER_FILE);
		expect(new Set(changedReads).size).toBe(PER_FILE);
		expect(changedReads.every((key) => key.startsWith("f2:"))).toBe(true);
	});
});
