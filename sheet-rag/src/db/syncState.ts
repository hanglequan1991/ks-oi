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
}

export interface TabKey {
	fileId: string;
	gid: string;
}

const SELECT_ALL_SQL = `
	SELECT source_file_id, source_gid, hotel_id, tab_name, hash, last_seen_at,
		missing_since, hidden_by_sync, prior_status, last_error, updated_at
	FROM sync_state`;

// Creates the row if it is absent. Only tab name and last seen time change; hash, error and missing flag stay.
const MARK_SEEN_SQL = `
	INSERT INTO sync_state (source_file_id, source_gid, tab_name, last_seen_at, updated_at)
	VALUES (?, ?, ?, ?, ?)
	ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
		tab_name = excluded.tab_name,
		last_seen_at = excluded.last_seen_at,
		updated_at = excluded.updated_at`;

// A successful apply stores the hash and clears the error and the missing flag.
const RECORD_SUCCESS_SQL = `
	INSERT INTO sync_state (source_file_id, source_gid, hotel_id, tab_name, hash, last_seen_at, missing_since, last_error, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
	ON CONFLICT (source_file_id, source_gid) DO UPDATE SET
		hotel_id = excluded.hotel_id,
		tab_name = excluded.tab_name,
		hash = excluded.hash,
		last_seen_at = excluded.last_seen_at,
		missing_since = NULL,
		last_error = NULL,
		updated_at = excluded.updated_at`;

// A failed apply keeps the old hash, so the next run retries the tab.
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

/** Records a successful apply: stores the hash and clears last_error and missing_since. */
export async function recordTabSuccess(
	db: D1Database,
	args: TabKey & { hotelId: string; tabName: string; hash: string; now: string },
): Promise<void> {
	await db
		.prepare(RECORD_SUCCESS_SQL)
		.bind(args.fileId, args.gid, args.hotelId, args.tabName, args.hash, args.now, args.now)
		.run();
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
