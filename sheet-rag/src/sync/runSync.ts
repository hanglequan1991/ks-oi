// Orchestrates one sheet sync run (STORY-14, TASK-54). Everything is injected: the D1
// binding, the SheetSource, the parser and the clock. No Cloudflare imports here.
//
// Order: list every file and tab (any failure ends the run with nothing removed), read and
// hash each tab (a failed read leaves that tab alone), plan, apply the changed tabs one at a
// time (a failing tab never stops the others), hide the removed tabs, then write the run log.
// The returned summary carries only counts and failure codes (AC9).

import { finishRun, startRun, getUnfinishedRuns, type RunCounts, type RunNoteItem } from "../db/syncRuns";
import { getSyncState, keyOf, markTabMissing, markTabSeen, recordTabError } from "../db/syncState";
import { buildDataVersionStatement } from "./overrides";
import { contentHash, hotelIdFor } from "./hash";
import { planSync } from "./planSync";
import { syncHotel } from "./syncHotel";
import { listAllTabs, SheetReadError, type SheetSource, type SheetTab } from "./sheetSource";
import type { ParsedHotel } from "./record";

/** Version of the sheet parser. Changing it makes every tab hash differently, so all are re-applied. */
export const PARSER_VERSION = "1";

/** A run that started less than this long ago, and has no finished_at, blocks a new run. */
const STALE_RUN_MS = 15 * 60 * 1000;

const SAFE_REASON = /^[a-z][a-z0-9_]{0,63}$/;
const UNKNOWN_REASON = "unexpected_error";

export type ParseResult = { ok: true; record: ParsedHotel } | { ok: false; reason: string };

export interface SyncDeps {
	db: D1Database;
	source: SheetSource;
	parse: (csv: string, tab: SheetTab) => ParseResult;
	now: () => string;
	/** Reserved for the folder import (TASK-55+). Not used by the run yet. */
	extract?: (...args: unknown[]) => unknown;
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
	failed_run?: true;
	skipped?: "already_running";
}

/** Keeps only short lowercase codes. Anything else (a URL, a message) becomes the unknown code. */
function sanitizeReason(reason: unknown): string {
	return typeof reason === "string" && SAFE_REASON.test(reason) ? reason : UNKNOWN_REASON;
}

function reasonOf(error: unknown): string {
	return error instanceof SheetReadError ? sanitizeReason(error.reason) : UNKNOWN_REASON;
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

async function hasRecentUnfinishedRun(db: D1Database, now: string): Promise<boolean> {
	const cutoff = Date.parse(now) - STALE_RUN_MS;
	const runs = await getUnfinishedRuns(db);
	return runs.some((run) => Date.parse(run.started_at) > cutoff);
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

	await markTabMissing(db, key, now, hotel.status);
	await db.batch([
		db
			.prepare("UPDATE hotels SET status = 'hidden' WHERE id = ? AND status <> 'hidden'")
			.bind(hotelId),
		db
			.prepare("UPDATE sync_state SET hidden_by_sync = 1, updated_at = ? WHERE source_file_id = ? AND source_gid = ?")
			.bind(now, row.source_file_id, row.source_gid),
		buildDataVersionStatement(db),
	]);
	return true;
}

export async function runSync(deps: SyncDeps, opts: SyncOptions = {}): Promise<SyncSummary> {
	const { db, source, parse } = deps;
	const now = deps.now();

	if (await hasRecentUnfinishedRun(db, now)) {
		return { ...emptyCounts(), failures: [], skipped: "already_running" };
	}

	const runId = await startRun(db, opts.kind ?? "manual", now);
	const counts = emptyCounts();
	const failures: SyncFailure[] = [];
	const items: RunNoteItem[] = [];

	const fail = (tab: string | null, reason: string): void => {
		counts.failed++;
		failures.push({ tab, reason });
		items.push(tab === null ? { kind: "failure", reason } : { kind: "failure", tab, reason });
	};

	const finish = async (failedRun: boolean): Promise<SyncSummary> => {
		await finishRun(db, runId, counts, items, deps.now());
		const summary: SyncSummary = { ...counts, failures };
		if (failedRun) summary.failed_run = true;
		return summary;
	};

	// Listing: any throw ends the run before anything is written.
	let tabs: SheetTab[];
	try {
		tabs = await listAllTabs(source);
	} catch (error) {
		fail(null, reasonOf(error));
		return finish(true);
	}

	try {
		// Read and hash each listed tab. A failed read is reported; the tab stays listed, so
		// planSync never treats it as removed, and it is not applied.
		const csvByKey = new Map<string, string>();
		const hashes = new Map<string, string>();
		for (const tab of tabs) {
			const key = keyOf(tab.fileId, tab.gid);
			try {
				const csv = await source.readCsv(tab);
				csvByKey.set(key, csv);
				hashes.set(key, await contentHash(csv, PARSER_VERSION));
			} catch (error) {
				fail(tab.tabName, reasonOf(error));
			}
		}

		const state = await getSyncState(db);
		for (const tab of tabs) {
			await markTabSeen(db, { fileId: tab.fileId, gid: tab.gid, tabName: tab.tabName, now });
		}

		const plan = planSync({ tabs, state, hashes, force: opts.force });
		counts.unchanged = plan.unchanged.length;

		const autoPublish = await readAutoPublish(db);
		for (const tab of plan.changed) {
			const key = keyOf(tab.fileId, tab.gid);
			const csv = csvByKey.get(key);
			if (csv === undefined) continue; // unreadable this run: already reported

			let parsed: ParseResult;
			try {
				parsed = parse(csv, tab);
			} catch {
				parsed = { ok: false, reason: UNKNOWN_REASON };
			}
			if (!parsed.ok) {
				const reason = sanitizeReason(parsed.reason);
				await recordTabError(db, { fileId: tab.fileId, gid: tab.gid, tabName: tab.tabName, error: reason, now });
				fail(tab.tabName, reason);
				continue;
			}

			const result = await syncHotel(db, {
				tab,
				record: parsed.record,
				hash: hashes.get(key) ?? "",
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
			} else if (result.outcome === "invalid") {
				fail(tab.tabName, sanitizeReason(result.issues?.[0]?.code));
			} else {
				fail(tab.tabName, "apply_failed");
			}
		}

		// An empty listing is treated as unknown by planSync, so nothing is hidden here.
		for (const row of plan.removed) {
			if (await hideRemovedTab(db, row, now)) counts.hidden++;
		}

		return finish(false);
	} catch {
		fail(null, UNKNOWN_REASON);
		return finish(true);
	}
}
