// Run log for the sheet sync (technical-design.html section 3.3, STORY-14 AC7, TASK-54).
// Takes the D1 binding as a parameter. Every caller value is a bound parameter.

export const NOTES_MAX_CHARS = 4000;

export interface RunCounts {
	created: number;
	updated: number;
	failed: number;
	hidden: number;
	unchanged: number;
}

/** One entry of the notes list. Only tab name, reason code and facility label; never URLs or messages. */
export interface RunNoteItem {
	kind: string;
	tab?: string | null;
	reason?: string;
	facility?: string;
}

export interface SyncRunRow {
	id: string;
	kind: string | null;
	started_at: string | null;
	finished_at: string | null;
	created: number;
	updated: number;
	failed: number;
	hidden: number;
	unchanged: number;
	notes: string | null;
}

export interface UnfinishedRun {
	id: string;
	started_at: string;
}

/** Inserts an unfinished run and returns its id. */
export async function startRun(db: D1Database, kind: string, now: string): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare("INSERT INTO sync_runs (id, kind, started_at) VALUES (?, ?, ?)")
		.bind(id, kind, now)
		.run();
	return id;
}

/** Stores the counts, the notes (truncated to NOTES_MAX_CHARS) and finished_at. */
export async function finishRun(
	db: D1Database,
	id: string,
	counts: RunCounts,
	items: RunNoteItem[],
	now: string,
): Promise<void> {
	await db
		.prepare(
			`UPDATE sync_runs SET finished_at = ?, created = ?, updated = ?, failed = ?, hidden = ?, unchanged = ?, notes = ?
			 WHERE id = ?`,
		)
		.bind(now, counts.created, counts.updated, counts.failed, counts.hidden, counts.unchanged, encodeNotes(items), id)
		.run();
}

/** Most recent run by start time, or null when the log is empty. */
export async function getLatestRun(db: D1Database): Promise<SyncRunRow | null> {
	return db
		.prepare("SELECT * FROM sync_runs ORDER BY started_at DESC, rowid DESC LIMIT 1")
		.first<SyncRunRow>();
}

/** Runs that have no finished_at (in progress, or left behind by a crash). */
export async function getUnfinishedRuns(db: D1Database): Promise<UnfinishedRun[]> {
	const { results } = await db
		.prepare("SELECT id, started_at FROM sync_runs WHERE finished_at IS NULL ORDER BY started_at")
		.all<UnfinishedRun>();
	return results;
}

function encodeWith(items: RunNoteItem[], truncated: boolean): string {
	return JSON.stringify({ items, truncated });
}

/**
 * JSON text of the notes, at most NOTES_MAX_CHARS long. When the full list does not fit,
 * the longest prefix that fits is kept and `truncated` is true. Always valid JSON.
 */
export function encodeNotes(items: RunNoteItem[]): string {
	const full = encodeWith(items, false);
	if (full.length <= NOTES_MAX_CHARS) return full;

	// The encoded length grows with the prefix length, so binary search the largest fit.
	let lo = 0;
	let hi = items.length - 1;
	let best = encodeWith([], true);
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const text = encodeWith(items.slice(0, mid), true);
		if (text.length <= NOTES_MAX_CHARS) {
			best = text;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best;
}
