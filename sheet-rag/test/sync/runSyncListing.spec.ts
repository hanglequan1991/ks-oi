// Listing cache and budget-aware listing of runSync (STORY-14, TASK-70). Fake D1 with the real
// migrations; injected clock; a source that counts listFiles, listTabs and readCsv calls.
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeD1, type FakeD1 } from "../fakes/d1";
import { applyMigrations } from "../fakes/migrations";
import { runSync, type ParseResult, type SyncDeps } from "../../src/sync/runSync";
import { getLatestRun } from "../../src/db/syncRuns";
import { countingDb } from "../../src/sync/countingDb";
import { createSubrequestBudget, type SubrequestBudget } from "../../src/sync/budget";
import { SheetReadError, type SheetFile, type SheetSource, type SheetTab } from "../../src/sync/sheetSource";
import type { ParsedHotel } from "../../src/sync/record";

const NOW = "2026-11-19T10:00:00Z";
const LATER = "2026-11-19T11:00:00Z";
const LATER2 = "2026-11-19T12:00:00Z";
const LATER3 = "2026-11-19T13:00:00Z";

type Db = SyncDeps["db"];
let db: FakeD1;
const asDb = (d: FakeD1): Db => d as unknown as Db;

const RECORD: ParsedHotel = {
	stars: 4,
	address: "12 Lê Lợi",
	area: "Hải Châu",
	descriptionVi: "Mô tả",
	descriptionEn: null,
	images: [],
	facilities: ["Hồ bơi"],
	rooms: [{ name: "Deluxe", basePrice: 1500000, rules: [] }],
	hotelRules: [],
};
const parseOk = (): ParseResult => ({ ok: true, record: RECORD });

interface Listing {
	files: SheetFile[];
	tabs: SheetTab[];
	skipSignature?: string;
}

interface Log {
	listFiles: number;
	listTabs: string[];
	readCsv: string[];
}

const newLog = (): Log => ({ listFiles: 0, listTabs: [], readCsv: [] });

interface Faults {
	listTabs?: (file: SheetFile) => SheetReadError | undefined;
}

/** A source over plain data. `data` may be changed between runs. Charges `budget` per fetch when given. */
function sourceOf(data: Listing, log: Log, budget?: SubrequestBudget, faults: Faults = {}): SheetSource {
	return {
		get skipSignature() {
			return data.skipSignature;
		},
		async listFiles() {
			budget?.spend(1);
			log.listFiles++;
			return data.files.map((f) => ({ ...f }));
		},
		async listTabs(file) {
			budget?.spend(1);
			log.listTabs.push(file.fileId);
			const fault = faults.listTabs?.(file);
			if (fault) throw fault;
			return data.tabs.filter((t) => t.fileId === file.fileId).map((t) => ({ ...t }));
		},
		async readCsv(tab) {
			budget?.spend(1);
			log.readCsv.push(`${tab.fileId}:${tab.gid}`);
			return "stars=4";
		},
	};
}

/** `n` files f1..fN (dated m1..mN), each with `perFile` tabs. */
function cities(n: number, perFile = 1): Listing {
	const files: SheetFile[] = [];
	const tabs: SheetTab[] = [];
	for (let i = 1; i <= n; i++) {
		files.push({ fileId: `f${i}`, fileName: `City ${i}`, modified: `m${i}` });
		for (let j = 1; j <= perFile; j++) {
			tabs.push({ fileId: `f${i}`, fileName: `City ${i}`, gid: `${i}.${j}`, tabName: `Hotel ${i}.${j}` });
		}
	}
	return { files, tabs };
}

function deps(source: SheetSource, at: string, extra: Partial<SyncDeps> = {}): SyncDeps {
	return { db: asDb(db), source, parse: parseOk, now: () => at, ...extra };
}

async function rows<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
	const { results } = await db.prepare(sql).bind(...params).all<T>();
	return results as T[];
}

async function notesOf(): Promise<Array<{ kind: string; reason?: string }>> {
	const latest = await getLatestRun(asDb(db));
	return JSON.parse(latest!.notes as string).items;
}

const LISTING_INCOMPLETE = { kind: "info", reason: "listing_incomplete" };

beforeEach(async () => {
	db = createFakeD1();
	await applyMigrations(db);
});

describe("runSync listing cache (TASK-70)", () => {
	it("unchanged modified skips listTabs and plans identically", async () => {
		const data = cities(2);
		data.skipSignature = "skip-v1";
		const first = newLog();
		await runSync(deps(sourceOf(data, first), NOW));

		const hotelsBefore = await rows<{ id: string; status: string }>("SELECT id, status FROM hotels ORDER BY id");

		const second = newLog();
		const result = await runSync(deps(sourceOf(data, second), LATER));

		expect(second.listTabs).toEqual([]);
		expect(second.listFiles).toBe(1);
		// Read-skip (TASK-73): the tabs are clean, unchanged and fresh, so the second run reads nothing.
		expect(second.readCsv).toEqual([]);
		expect(result).toMatchObject({ created: 0, updated: 0, failed: 0, hidden: 0, unchanged: 2 });
		const hotelsAfter = await rows<{ id: string; status: string }>("SELECT id, status FROM hotels ORDER BY id");
		expect(hotelsAfter).not.toHaveLength(0);
		expect(hotelsAfter).toEqual(hotelsBefore);
	});

	it("changed modified relists and updates the cache", async () => {
		const data = cities(2);
		await runSync(deps(sourceOf(data, newLog()), NOW));

		data.files[0].modified = "m1-new";
		const log = newLog();
		await runSync(deps(sourceOf(data, log), LATER));

		expect(log.listTabs).toEqual(["f1"]);
		const cached = await rows<{ file_id: string; modified: string }>("SELECT file_id, modified FROM sync_files ORDER BY file_id");
		expect(cached).toEqual([
			{ file_id: "f1", modified: "m1-new" },
			{ file_id: "f2", modified: "m2" },
		]);
	});

	it("changed skip signature relists all files", async () => {
		const data = cities(2);
		data.skipSignature = "skip-v1";
		await runSync(deps(sourceOf(data, newLog()), NOW));

		data.skipSignature = "skip-v2";
		const log = newLog();
		await runSync(deps(sourceOf(data, log), LATER));

		expect(log.listTabs).toEqual(["f1", "f2"]);
		const cached = await rows<{ skip_sig: string }>("SELECT skip_sig FROM sync_files ORDER BY file_id");
		expect(cached.map((r) => r.skip_sig)).toEqual(["skip-v2", "skip-v2"]);
	});

	it("missing modified always relists", async () => {
		const data = cities(2);
		for (const file of data.files) delete file.modified;

		const first = newLog();
		await runSync(deps(sourceOf(data, first), NOW));
		const second = newLog();
		await runSync(deps(sourceOf(data, second), LATER));

		expect(first.listTabs).toEqual(["f1", "f2"]);
		expect(second.listTabs).toEqual(["f1", "f2"]);
		const cached = await rows<{ modified: string | null }>("SELECT modified FROM sync_files");
		expect(cached.map((r) => r.modified)).toEqual([null, null]);
	});

	it("cold cache with small budget lists some files, defers others, hides nothing, converges", async () => {
		const data = cities(10);
		const listedPerRun: string[][] = [];

		// Budget 24: a run spends 4 calls before the first listing (unfinished-run read, startRun,
		// listFiles, sync_files read). Each listing then costs 2 (listTabs and its upsert), so exactly
		// 3 listings pass the 16-subrequest gate.
		for (const at of [NOW, LATER, LATER2, LATER3]) {
			const log = newLog();
			const budget = createSubrequestBudget(24);
			const result = await runSync(
				deps(sourceOf(data, log, budget), at, { db: countingDb(asDb(db), budget), budget }),
			);
			listedPerRun.push(log.listTabs);

			expect(result.failed_run).toBeUndefined();
			expect(result.hidden).toBe(0);
			expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(0);
			expect(await rows("SELECT source_gid FROM sync_state WHERE missing_since IS NOT NULL")).toHaveLength(0);

			if (at === NOW) {
				expect(await notesOf()).toContainEqual(LISTING_INCOMPLETE);
				// A tab of a listed file still starts after the last affordable listing.
				expect(result.created + result.updated + result.failed + result.unchanged).toBeGreaterThanOrEqual(1);
			}
		}

		expect(listedPerRun).toEqual([["f1", "f2", "f3"], ["f4", "f5", "f6"], ["f7", "f8", "f9"], ["f10"]]);
		expect(await notesOf()).not.toContainEqual(LISTING_INCOMPLETE);
	});

	it("falls back to cached tabs when relisting is unaffordable", async () => {
		const data = cities(2);
		data.skipSignature = "s1";
		await runSync(deps(sourceOf(data, newLog()), NOW));

		// Budget 16: after listFiles only 15 remain, so no listing passes the gate.
		// Source-only budget (the db is not counted here), so only listing and reads spend it.
		data.files[0].modified = "m1-new";
		const budgetA = createSubrequestBudget(16);
		const logA = newLog();
		const resultA = await runSync(deps(sourceOf(data, logA, budgetA), LATER, { budget: budgetA }));

		expect(logA.listTabs).toEqual([]);
		expect(resultA.unchanged).toBe(2);
		expect(await notesOf()).not.toContainEqual(LISTING_INCOMPLETE);

		// A different skip signature: the cached list of f1 and f2 is not used.
		data.skipSignature = "s2";
		const budgetB = createSubrequestBudget(16);
		const logB = newLog();
		const resultB = await runSync(deps(sourceOf(data, logB, budgetB), LATER2, { budget: budgetB }));

		expect(logB.listTabs).toEqual([]);
		expect(logB.readCsv).toEqual([]);
		expect(resultB).toMatchObject({ unchanged: 0, hidden: 0 });
		expect(resultB.failed_run).toBeUndefined();
		expect(await notesOf()).toContainEqual(LISTING_INCOMPLETE);
		expect(await rows("SELECT id FROM hotels WHERE status = 'hidden'")).toHaveLength(0);
		expect(await rows("SELECT source_gid FROM sync_state WHERE missing_since IS NOT NULL")).toHaveLength(0);
	});

	it("idle run makes zero listTabs fetches and one listing fetch", async () => {
		const small = cities(2);
		await runSync(deps(sourceOf(small, newLog()), NOW));
		const idleSmall = newLog();
		await runSync(deps(sourceOf(small, idleSmall), LATER));
		expect(idleSmall.listTabs).toEqual([]);
		expect(idleSmall.listFiles).toBe(1);
		expect(idleSmall.readCsv).toEqual([]);

		// 450 tabs in 9 files: the idle run lists nothing per file and reads at most maxTabsPerRun.
		// The cold run reads only 25 of 450 tabs (cap 25), so the next run still has unchecked tabs
		// and reads 1 to 25 of them (read-skip, TASK-73, only covers tabs already checked).
		const big = cities(9, 50);
		await runSync(deps(sourceOf(big, newLog()), LATER2));
		const idleBig = newLog();
		const result = await runSync(deps(sourceOf(big, idleBig), LATER3));
		expect(idleBig.listTabs).toEqual([]);
		expect(idleBig.listFiles).toBe(1);
		expect(idleBig.readCsv.length).toBeGreaterThan(0);
		expect(idleBig.readCsv.length).toBeLessThanOrEqual(25);
		expect(result.failed_run).toBeUndefined();
	});

	it("idle run still reads when modified is missing", async () => {
		const data = cities(2);
		for (const file of data.files) delete file.modified;
		await runSync(deps(sourceOf(data, newLog()), NOW));

		const second = newLog();
		await runSync(deps(sourceOf(data, second), LATER));
		expect(second.listFiles).toBe(1);
		expect(second.readCsv).toHaveLength(2);
	});

	it("listTabs failure fails the run with a code and writes no cache row", async () => {
		const data = cities(2);
		const log = newLog();
		const faults: Faults = {
			listTabs: (file) => (file.fileId === "f2" ? new SheetReadError("tab_list_parse_empty") : undefined),
		};

		const result = await runSync(deps(sourceOf(data, log, undefined, faults), NOW));

		expect(result).toMatchObject({ failed_run: true, failed: 1, hidden: 0, created: 0 });
		expect(result.failures).toEqual([{ tab: null, reason: "tab_list_parse_empty" }]);
		expect(result.aborted).toBeUndefined();
		const cached = await rows<{ file_id: string }>("SELECT file_id FROM sync_files");
		expect(cached.map((r) => r.file_id)).toEqual(["f1"]);
		expect(await rows("SELECT id FROM hotels")).toHaveLength(0);
	});

	it("subrequest_limit during listTabs trips the breaker and finishes the row", async () => {
		for (const cause of ["subrequest_limit", "illegal_invocation"] as const) {
			db = createFakeD1();
			await applyMigrations(db);
			const data = cities(2);
			const log = newLog();
			const faults: Faults = {
				listTabs: (file) => (file.fileId === "f1" ? new SheetReadError(`list_${cause}`, cause) : undefined),
			};

			const result = await runSync(deps(sourceOf(data, log, undefined, faults), LATER));

			expect(log.listTabs).toEqual(["f1"]);
			expect(result).toMatchObject({ failed_run: true, aborted: "circuit_breaker", failed: 1 });
			expect(result.failures).toEqual([{ tab: null, reason: `list_${cause}` }]);
			const latest = await getLatestRun(asDb(db));
			expect(latest).toMatchObject({ finished_at: LATER, failed: 1 });
			expect(await notesOf()).toContainEqual({ kind: "abort", reason: "aborted_circuit_breaker" });
			expect(await rows("SELECT file_id FROM sync_files")).toHaveLength(0);
		}
	});
});
