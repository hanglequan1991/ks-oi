// Sync state per sheet tab (technical-design.html section 3.3, STORY-14 AC10-AC13, TASK-49).
// Takes the D1 binding as a parameter. Every caller value is a bound parameter.
// Rows are keyed by (source_file_id, source_gid); the map key is `fileId:gid`.

export interface SyncStateRow {
	source_file_id: string;
	source_gid: string;
	hotel_id: string | null;
	tab_name: string | null;
	hash: string | null;
	last_seen_at: string | null;
	missing_since: string | null;
	hidden_by_sync: number;
	prior_status: string | null;
	last_error: string | null;
	updated_at: string | null;
	last_checked_at: string | null;
}

export interface TabKey {
	fileId: string;
	gid: string;
}

// D1 batch chunk size for markTabsSeenBatch.
const SEEN_BATCH_CHUNK = 50;

const SELECT_ALL_SQL = `
	SELECT source_file_id, source_gid, hotel_id, tab_name, hash, last_seen_at,
		missing_since, hidden_by_sync, prior_status, last_error, updated_at, last_checked_at
	FROM sync_state`;

// Creates the row if it is absent. Only tab name and last seen time change; hash, error and missing flag stay.
const MARK_SEEN_SQL = `
	INSERT INTO sync_state (source_file_id, source_gid, tab_name, last_seen_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
		tab_name = excluded.tab_name,
		last_seen_at = excluded.last_seen_at,
		updated_at = excluded.updated_at`;

// Sets last_checked_at for existing rows only, so tabs without a row are ignored.
const MARK_CHECKED_SQL = `
	UPDATE sync_state SET
		last_checked_at = ?,
		updated_at = ?
	WHERE source_file_id = ? AND source_gid = ?`;

// A successful apply stores the hash, clears the error and the missing flag, and sets last_checked_at.
const RECORD_SUCCESS_SQL = `
	INSERT INTO sync_state (source_file_id, source_gid, hotel_id, tab_name, hash, last_seen_at, missing_since, last_error, updated_at, last_checked_at)
	VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
	ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
		hotel_id = excluded.hotel_id,
		tab_name = excluded.tab_name,
		hash = excluded.hash,
		last_seen_at = excluded.last_seen_at,
		missing_since = NULL,
		last_error = NULL,
		updated_at = excluded.updated_at,
		last_checked_at = excluded.last_checked_at`;

// A failed apply keeps the old hash, so the next run retries the tab. It does not touch last_checked_at:
// a failing tab is retried, but it sinks in the pickOldestFirst order only after a success elsewhere.
const RECORD_ERROR_SQL = `
	INSERT INTO sync_state (source_file_id, source_gid, tab_name, last_error, updated_at)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
		tab_name = excluded.tab_name,
		last_error = excluded.last_error,
		updated_at = excluded.updated_at`;

// Keeps the first missing_since so the time of disappearance is not moved by later runs.
const MARK_MISSING_SQL = `
	UPDATE sync_state SET
		missing_since = COALESCE(missing_since, ?),
		prior_status = ?,
		updated_at = ?
	WHERE source_file_id = ? AND source_gid = ?`;

/** All sync state rows, keyed by `fileId:gid`. */
export async function getSyncState(db: D1Database): Promise<Map<string, SyncStateRow>> {
	const { results } = await db.prepare(SELECT_ALL_SQL).all<SyncStateRow>();
	const state = new Map<string, SyncStateRow>();
	for (const row of results) {
		state.set(keyOf(row.source_file_id, row.source_gid), row);
	}
	return state;
}

/** Records that the tab is present in the listing this run. */
export async function markTabSeen(
	db: D1Database,
	args: TabKey & { tabName: string; now: string },
): Promise<void> {
	await db
		.prepare(MARK_SEEN_SQL)
		.bind(args.fileId, args.gid, args.tabName, args.now, args.now)
		.run();
}

/**
 * Marks the tabs as checked at `now` (last_checked_at and updated_at), in one batch.
 * Tabs without a row are ignored. Empty input makes no D1 call.
 */
export async function markTabsChecked(
	db: D1Database,
	keys: TabKey[],
	now: string,
): Promise<void> {
	if (keys.length === 0) return;
	const statements = keys.map((key) =>
		db.prepare(MARK_CHECKED_SQL).bind(now, now, key.fileId, key.gid),
	);
	await db.batch(statements);
}

/**
 * Same upsert as markTabSeen, for many tabs. Runs in batches of at most 50 statements.
 * Empty input makes no D1 call.
 */
export async function markTabsSeenBatch(
	db: D1Database,
	tabs: Array<TabKey & { tabName: string }>,
	now: string,
): Promise<void> {
	for (let start = 0; start < tabs.length; start += SEEN_BATCH_CHUNK) {
		const chunk = tabs.slice(start, start + SEEN_BATCH_CHUNK);
		const statements = chunk.map((tab) =>
			db.prepare(MARK_SEEN_SQL).bind(tab.fileId, tab.gid, tab.tabName, now, now),
		);
		await db.batch(statements);
	}
}

/** Records a successful apply: stores the hash, clears last_error and missing_since, sets last_checked_at. */
export async function recordTabSuccess(
	db: D1Database,
	args: TabKey & { hotelId: string; tabName: string; hash: string; now: string },
): Promise<void> {
	await db
		.prepare(RECORD_SUCCESS_SQL)
		.bind(args.fileId, args.gid, args.hotelId, args.tabName, args.hash, args.now, args.now, args.now)
		.run();
}

/**
 * Orders tabs for a budgeted run: never-checked tabs first (no row or null last_checked_at),
 * then ascending last_checked_at. Ties keep the listing order (stable sort).
 * Returns at most `limit` tabs and how many were deferred.
 */
export function pickOldestFirst<T extends TabKey>(
	tabs: T[],
	state: Map<string, SyncStateRow>,
	limit: number,
): { picked: T[]; deferred: number } {
	const checkedAt = (tab: T): string | null =>
		state.get(keyOf(tab.fileId, tab.gid))?.last_checked_at ?? null;
	const sorted = [...tabs].sort((a, b) => {
		const aLast = checkedAt(a);
		const bLast = checkedAt(b);
		if (aLast === null || bLast === null) {
			if (aLast === bLast) return 0;
			return aLast === null ? -1 : 1;
		}
		return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
	});
	const picked = sorted.slice(0, Math.max(0, limit));
	return { picked, deferred: tabs.length - picked.length };
}

/** Records a failed apply: stores the error and keeps the previous hash. */
export async function recordTabError(
	db: D1Database,
	args: TabKey & { tabName: string; error: string; now: string },
): Promise<void> {
	await db
		.prepare(RECORD_ERROR_SQL)
		.bind(args.fileId, args.gid, args.tabName, args.error, args.now)
		.run();
}

/** Marks a row (key `fileId:gid`) as missing. An existing missing_since is kept. */
export async function markTabMissing(
	db: D1Database,
	key: string,
	now: string,
	priorStatus: string | null,
): Promise<void> {
	const { fileId, gid } = splitKey(key);
	await db
		.prepare(MARK_MISSING_SQL)
		.bind(now, priorStatus, now, fileId, gid)
		.run();
}

export function keyOf(fileId: string, gid: string): string {
	return `${fileId}:${gid}`;
}

// The gid is numeric, so the last colon separates it from the file id.
function splitKey(key: string): TabKey {
	const at = key.lastIndexOf(":");
	return { fileId: key.slice(0, at), gid: key.slice(at + 1) };
}
