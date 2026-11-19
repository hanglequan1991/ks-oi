// Orchestrates one sheet sync run (STORY-14, TASK-54, TASK-69). Everything is injected: the D1
// binding, the SheetSource, the parser, the clock and the subrequest budget. No Cloudflare imports here.
//
// Order: list every file and tab (any failure ends the run with nothing removed), mark every listed
// tab seen (one batch per 50 tabs), pick at most maxTabsPerRun tabs oldest-first (never checked first),
// then for each picked tab, one at a time: read and hash it (a failed read leaves that tab alone),
// skip it when unchanged, otherwise apply it (a failing tab never stops the others). Stops cleanly
// with `budget_exhausted` when the next tab is not affordable, then marks the unchanged and the
// attempted-but-failed tabs checked (one batch), hides the removed tabs (only after a complete run)
// and writes the run log. The run row is always finished.
// The returned summary carries only counts and failure codes (AC9).

import {
	abandonRun,
	finishRun,
	startRun,
	getUnfinishedRuns,
	type RunCounts,
	type RunNoteItem,
} from "../db/syncRuns";
import {
	getSyncState,
	keyOf,
	markTabMissing,
	markTabsChecked,
	markTabsSeenBatch,
	pickOldestFirst,
	recordTabError,
	type TabKey,
} from "../db/syncState";
import { buildDataVersionStatement } from "./overrides";
import { contentHash, hotelIdFor } from "./hash";
import {
	createDeadline,
	createSubrequestBudget,
	DEFAULT_MAX_TABS_PER_RUN,
	DEFAULT_SUBREQUEST_BUDGET,
	type RunLimits,
	type SubrequestBudget,
} from "./budget";
import { NETWORK_CAUSES, type NetworkCause } from "./fetchErrors";
import { planSync } from "./planSync";
import { syncHotel } from "./syncHotel";
import { listAllTabs, SheetReadError, type SheetSource, type SheetTab } from "./sheetSource";
import type { ParsedHotel } from "./record";

/** Version of the sheet parser. Changing it makes every tab hash differently, so all are re-applied. */
export const PARSER_VERSION = "1";

/**
 * Tries of one tab read. The public page source retries up to 3 times (MAX_TRIES in publicGoogleSource),
 * so one tab read can cost this many fetches.
 */
export const TAB_FETCH_TRIES = 3;

/**
 * D1 calls of one applied tab. Measured by the TAB_RESERVE test: countingDb over a full syncHotel, for a
 * created tab, an updated tab and a tab whose batch fails. The test fails if syncHotel later grows.
 */
export const TAB_APPLY_CALLS = 5;

/**
 * Subrequests kept for one tab before it starts: its worst-case fetches plus its worst-case D1 calls.
 * A tab starts only when this plus FINISH_RESERVE is affordable.
 */
export const TAB_RESERVE = TAB_FETCH_TRIES + TAB_APPLY_CALLS;

/** Subrequests kept for the end of the run: the markTabsChecked batch and the finishRun call. */
export const FINISH_RESERVE = 2;

/** D1 calls of one hideRemovedTab: the hotel lookup and one write (markTabMissing or the batch). */
const HIDE_CALLS = 2;

/** A run that started less than this long ago, and has no finished_at, blocks a new run. */
const STALE_RUN_MS = 15 * 60 * 1000;

/** Consecutive read failures with the same network cause that stop the run. */
export const BREAKER_THRESHOLD = 5;

/** These causes make retrying pointless, so the breaker trips on the first failure. */
const IMMEDIATE_CAUSES: ReadonlySet<NetworkCause> = new Set<NetworkCause>(["subrequest_limit", "illegal_invocation"]);

const DEFAULT_LIMITS: RunLimits = { subrequestBudget: DEFAULT_SUBREQUEST_BUDGET, maxTabsPerRun: DEFAULT_MAX_TABS_PER_RUN };

// Same effect as markTabMissing plus hidden_by_sync = 1. Kept as one statement so it can share a batch.
const MARK_REMOVED_HIDDEN_SQL = `
	UPDATE sync_state SET
		missing_since = COALESCE(missing_since, ?),
		prior_status = ?,
		hidden_by_sync = 1,
		updated_at = ?
	WHERE source_file_id = ? AND source_gid = ?`;

const SAFE_REASON =/^[a-z][a-z0-9_]{0,63}$/;
const UNKNOWN_REASON = "unexpected_error";

export type ParseResult = { ok: true; record: ParsedHotel } | { ok: false; reason: string };

export interface SyncDeps {
	db: D1Database;
	source: SheetSource;
	parse: (csv: string, tab: SheetTab) => ParseResult;
	now: () => string;
	/** Reserved for the folder import (TASK-55+). Not used by the run yet. */
	extract?: (...args: unknown[]) => unknown;
	/** Wall clock in ms for the run deadline. Defaults to Date.now. */
	nowMs?: () => number;
	/** Per-run limits. Defaults to 40 subrequests and 25 tabs. Only maxTabsPerRun is read here. */
	limits?: RunLimits;
	/**
	 * Subrequest counter shared with the wrapped db and fetch (countingDb, countingFetch). runSync only
	 * reads it to decide whether the next tab can start; it wraps nothing itself. Defaults to unlimited.
	 */
	budget?: SubrequestBudget;
}

export interface SyncOptions {
	force?: boolean;
	/** Stored in sync_runs.kind. Defaults to `manual`. */
	kind?: string;
}

export interface SyncFailure {
	/** Tab name, or null for a run-level failure. */
	tab: string | null;
	reason: string;
}

export interface SyncSummary {
	created: number;
	updated: number;
	failed: number;
	hidden: number;
	unchanged: number;
	failures: SyncFailure[];
	/** Listed tabs not started this run (over the cap, or after a stop). Count only; they are never hidden. */
	deferred: number;
	failed_run?: true;
	skipped?: "already_running";
	/** Set when the run stopped reading tabs early. Nothing is hidden in that case. */
	aborted?: "circuit_breaker" | "deadline" | "budget_exhausted";
}

/** Keeps only short lowercase codes. Anything else (a URL, a message) becomes the unknown code. */
function sanitizeReason(reason: unknown): string {
	return typeof reason === "string" && SAFE_REASON.test(reason) ? reason : UNKNOWN_REASON;
}

function reasonOf(error: unknown): string {
	return error instanceof SheetReadError ? sanitizeReason(error.reason) : UNKNOWN_REASON;
}

/** The network cause of a thrown fetch, or undefined (HTTP status failures and other errors). */
function networkCauseOf(error: unknown): NetworkCause | undefined {
	if (!(error instanceof SheetReadError) || error.networkCause === undefined) return undefined;
	return (NETWORK_CAUSES as readonly string[]).includes(error.networkCause) ? error.networkCause : undefined;
}

function emptyCounts(): RunCounts {
	return { created: 0, updated: 0, failed: 0, hidden: 0, unchanged: 0 };
}

async function readAutoPublish(db: D1Database): Promise<boolean> {
	const row = await db
		.prepare("SELECT value FROM settings WHERE key = 'sync_auto_publish'")
		.first<{ value: string }>();
	return row?.value === "true";
}

/**
 * Checks for an unfinished run. Returns true when one is recent (blocks the run; nothing is
 * written). Otherwise every stale one (older than STALE_RUN_MS) is abandoned and false is returned.
 */
async function blockedByRecentRun(db: D1Database, now: string): Promise<boolean> {
	const cutoff = Date.parse(now) - STALE_RUN_MS;
	const runs = await getUnfinishedRuns(db);
	if (runs.some((run) => Date.parse(run.started_at) > cutoff)) return true;
	for (const run of runs) {
		await abandonRun(db, run.id, now);
	}
	return false;
}

/**
 * Hides the hotel of a tab that disappeared from the sheet. An owner-hidden hotel is not
 * touched; the tab is still marked missing, so a return restores nothing it did not hide.
 */
async function hideRemovedTab(
	db: D1Database,
	row: { source_file_id: string; source_gid: string; hotel_id: string | null },
	now: string,
): Promise<boolean> {
	const key = keyOf(row.source_file_id, row.source_gid);
	const hotelId = row.hotel_id ?? (await hotelIdFor(row.source_file_id, row.source_gid));
	const hotel = await db
		.prepare("SELECT status FROM hotels WHERE id = ?")
		.bind(hotelId)
		.first<{ status: string }>();

	if (!hotel || hotel.status === "hidden") {
		await markTabMissing(db, key, now, hotel ? hotel.status : null);
		return false;
	}

	// One batch: the missing mark, the hotel hide and the data version commit together or not at
	// all. A failed batch leaves the tab unmarked, so the next run lists it as removed again.
	await db.batch([
		db
			.prepare(MARK_REMOVED_HIDDEN_SQL)
			.bind(now, hotel.status, now, row.source_file_id, row.source_gid),
		db
			.prepare("UPDATE hotels SET status = 'hidden' WHERE id = ? AND status <> 'hidden'")
			.bind(hotelId),
		buildDataVersionStatement(db),
	]);
	return true;
}

export async function runSync(deps: SyncDeps, opts: SyncOptions = {}): Promise<SyncSummary> {
	const { db, source, parse } = deps;
	const now = deps.now();
	const nowMs = deps.nowMs ?? Date.now;
	const limits = deps.limits ?? DEFAULT_LIMITS;
	const budget = deps.budget ?? createSubrequestBudget(Infinity);

	if (await blockedByRecentRun(db, now)) {
		return { ...emptyCounts(), failures: [], deferred: 0, skipped: "already_running" };
	}

	const deadline = createDeadline(nowMs(), nowMs);
	const runId = await startRun(db, opts.kind ?? "manual", now);
	const counts = emptyCounts();
	// Read failures are reported before the others, as before the per-tab loop.
	const readFailures: SyncFailure[] = [];
	const failures: SyncFailure[] = [];
	const items: RunNoteItem[] = [];
	let aborted: SyncSummary["aborted"];
	let tabs: SheetTab[] = [];
	let started = 0;

	const fail = (tab: string | null, reason: string, readPhase = false): void => {
		counts.failed++;
		(readPhase ? readFailures : failures).push({ tab, reason });
		items.push(tab === null ? { kind: "failure", reason } : { kind: "failure", tab, reason });
	};

	const finish = async (failedRun: boolean): Promise<SyncSummary> => {
		await finishRun(db, runId, counts, items, deps.now());
		// Every listed tab that was not started is deferred (cap, budget, deadline or breaker).
		const summary: SyncSummary = {
			...counts,
			failures: [...readFailures, ...failures],
			deferred: tabs.length - started,
		};
		if (failedRun) summary.failed_run = true;
		if (aborted) summary.aborted = aborted;
		return summary;
	};

	// Listing: any throw ends the run before anything is written.
	try {
		tabs = await listAllTabs(source);
	} catch (error) {
		fail(null, reasonOf(error));
		return finish(true);
	}

	try {
		const state = await getSyncState(db);
		await markTabsSeenBatch(
			db,
			tabs.map((tab) => ({ fileId: tab.fileId, gid: tab.gid, tabName: tab.tabName })),
			now,
		);

		const { picked } = pickOldestFirst(tabs, state, limits.maxTabsPerRun);
		const autoPublish = await readAutoPublish(db);
		const unchangedKeys: TabKey[] = [];
		// last_checked_at (sync_tab_checks) means "last attempt", not "last success": it only orders the
		// picks (pickOldestFirst), so a tab that keeps failing rotates to the back instead of starving the
		// rest. A failed tab keeps its hash, so change detection and the retry are unaffected.
		const attemptedKeys: TabKey[] = [];
		const csvOf = new Map<string, string>();

		// Read, hash and apply the picked tabs one at a time. A tab starts only when its worst case
		// (TAB_RESERVE) plus the end-of-run calls (FINISH_RESERVE) is affordable, so the run never
		// runs out of budget in the middle of a tab.
		// Stops early (no tab is hidden then) on the soft/hard deadline, on the budget, or when the
		// circuit breaker trips: the same network cause on BREAKER_THRESHOLD reads in a row (1 for
		// IMMEDIATE_CAUSES). A success, an HTTP-status failure or another cause resets the streak.
		let streakCause: NetworkCause | undefined;
		let streak = 0;
		for (const tab of picked) {
			if (deadline.softExceeded() || deadline.hardExceeded()) {
				aborted = "deadline";
				items.push({ kind: "abort", reason: "deadline" });
				break;
			}
			if (!budget.canAfford(TAB_RESERVE + FINISH_RESERVE)) {
				aborted = "budget_exhausted";
				items.push({ kind: "abort", reason: "budget_exhausted" });
				break;
			}
			started++;

			const key = keyOf(tab.fileId, tab.gid);
			const tabKey: TabKey = { fileId: tab.fileId, gid: tab.gid };
			let hash: string;
			try {
				const csv = await source.readCsv(tab);
				hash = await contentHash(csv, PARSER_VERSION);
				streak = 0;
				streakCause = undefined;
				csvOf.set(key, csv);
			} catch (error) {
				fail(tab.tabName, reasonOf(error), true);
				attemptedKeys.push(tabKey);
				const cause = networkCauseOf(error);
				if (cause === undefined) {
					streak = 0;
					streakCause = undefined;
					continue;
				}
				streak = cause === streakCause ? streak + 1 : 1;
				streakCause = cause;
				const threshold = IMMEDIATE_CAUSES.has(cause) ? 1 : BREAKER_THRESHOLD;
				if (streak >= threshold) {
					aborted = "circuit_breaker";
					items.push({ kind: "abort", reason: "aborted_circuit_breaker" });
					break;
				}
				continue;
			}

			const single = planSync({ tabs: [tab], state, hashes: new Map([[key, hash]]), force: opts.force });
			if (single.unchanged.length > 0) {
				counts.unchanged++;
				unchangedKeys.push({ fileId: tab.fileId, gid: tab.gid });
				continue;
			}

			let parsed: ParseResult;
			try {
				parsed = parse(csvOf.get(key) ?? "", tab);
			} catch {
				parsed = { ok: false, reason: UNKNOWN_REASON };
			}
			if (!parsed.ok) {
				const reason = sanitizeReason(parsed.reason);
				await recordTabError(db, { fileId: tab.fileId, gid: tab.gid, tabName: tab.tabName, error: reason, now });
				fail(tab.tabName, reason);
				attemptedKeys.push(tabKey);
				continue;
			}

			const result = await syncHotel(db, {
				tab,
				record: parsed.record,
				hash,
				now,
				autoPublish,
			});
			for (const facility of result.unmappedFacilities) {
				items.push({ kind: "unmapped_facility", tab: tab.tabName, facility });
			}
			if (result.outcome === "created") {
				counts.created++;
			} else if (result.outcome === "updated") {
				counts.updated++;
			} else {
				// invalid or apply_failed. Applied tabs are not added: recordTabSuccess writes their check time.
				attemptedKeys.push(tabKey);
				fail(tab.tabName, result.outcome === "invalid" ? sanitizeReason(result.issues?.[0]?.code) : "apply_failed");
			}
		}

		// One batch for every picked tab that was unchanged or attempted and failed (at most the cap of
		// 25 statements). Applied tabs are not in it.
		await markTabsChecked(db, [...unchangedKeys, ...attemptedKeys], now);

		// Removed tabs come from the full listing, so a deferred tab is never one of them. After an
		// early stop the removals are not applied at all. Each removal needs its own budget check;
		// the ones left over wait for the next run (they stay removed in the next plan).
		if (aborted === undefined) {
			const { removed } = planSync({ tabs, state, hashes: new Map() });
			for (const row of removed) {
				if (!budget.canAfford(HIDE_CALLS + FINISH_RESERVE)) break;
				if (await hideRemovedTab(db, row, now)) counts.hidden++;
			}
		}

		return finish(false);
	} catch {
		fail(null, UNKNOWN_REASON);
		return finish(true);
	}
}
