// Per-file listing cache for the sheet sync (STORY-14, TASK-66, migration 0004).
// A file whose `modified` time and skip fingerprint are unchanged skips listTabs.
// Takes the D1 binding as a parameter. Every caller value is a bound parameter.

export interface SyncFileTab {
	gid: string;
	tabName: string;
}

export interface SyncFileRow {
	fileId: string;
	fileName: string | null;
	modified: string | null;
	skipSig: string | null;
	tabs: SyncFileTab[] | null;
	listedAt: string | null;
}

interface SyncFileDbRow {
	file_id: string;
	file_name: string | null;
	modified: string | null;
	skip_sig: string | null;
	tabs_json: string | null;
	listed_at: string | null;
}

const SELECT_ALL_SQL = `
	SELECT file_id, file_name, modified, skip_sig, tabs_json, listed_at
	FROM sync_files`;

const UPSERT_SQL = `
	INSERT INTO sync_files (file_id, file_name, modified, skip_sig, tabs_json, listed_at)
	VALUES (?, ?, ?, ?, ?, ?)
	ON CONFLICT (file_id) DO UPDATE SET
		file_name = excluded.file_name,
		modified = excluded.modified,
		skip_sig = excluded.skip_sig,
		tabs_json = excluded.tabs_json,
		listed_at = excluded.listed_at`;

/** All cached file listings, keyed by file id. */
export async function getSyncFiles(db: D1Database): Promise<Map<string, SyncFileRow>> {
	const { results } = await db.prepare(SELECT_ALL_SQL).all<SyncFileDbRow>();
	const files = new Map<string, SyncFileRow>();
	for (const row of results) {
		files.set(row.file_id, {
			fileId: row.file_id,
			fileName: row.file_name,
			modified: row.modified,
			skipSig: row.skip_sig,
			tabs: parseTabs(row.tabs_json),
			listedAt: row.listed_at,
		});
	}
	return files;
}

/** Inserts or replaces the cached listing of one file. */
export async function upsertSyncFile(db: D1Database, row: SyncFileRow): Promise<void> {
	await db
		.prepare(UPSERT_SQL)
		.bind(
			row.fileId,
			row.fileName,
			row.modified,
			row.skipSig,
			row.tabs === null ? null : JSON.stringify(row.tabs),
			row.listedAt,
		)
		.run();
}

// Never throws: invalid JSON or an unexpected shape reads as null tabs.
function parseTabs(json: string | null): SyncFileTab[] | null {
	if (json === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	const tabs: SyncFileTab[] = [];
	for (const item of parsed) {
		if (
			typeof item !== "object" ||
			item === null ||
			typeof (item as SyncFileTab).gid !== "string" ||
			typeof (item as SyncFileTab).tabName !== "string"
		) {
			return null;
		}
		tabs.push({ gid: (item as SyncFileTab).gid, tabName: (item as SyncFileTab).tabName });
	}
	return tabs;
}
