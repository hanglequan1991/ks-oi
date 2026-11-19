-- migrations/0004_sync_budget.sql
-- Sync budget support (STORY-14, TASK-66): last successful check per tab, and a per-file listing cache.
-- Fully re-runnable: every statement is CREATE TABLE IF NOT EXISTS, so applying it twice is safe.

-- Time of the last successful check of each tab (set by recordTabSuccess, syncHotel and markTabsChecked).
-- tab_key = keyOf(fileId, gid), i.e. `fileId:gid`. A tab with no row was never checked successfully.
-- A failed tab keeps its old row (unlike last_seen_at).
CREATE TABLE IF NOT EXISTS sync_tab_checks (
  tab_key TEXT PRIMARY KEY,                -- `fileId:gid`
  last_checked_at TEXT NOT NULL
);

-- Per-file listing cache: skips listTabs for files whose modified time did not change.
-- tabs_json: JSON array of {gid, tabName}, the list after SKIP_TABS filtering.
-- skip_sig: fingerprint of the skip list used to build tabs_json.
CREATE TABLE IF NOT EXISTS sync_files (
  file_id TEXT PRIMARY KEY,                -- Google Sheets file id
  file_name TEXT,
  modified TEXT,                           -- modifiedTime reported by Drive
  skip_sig TEXT,
  tabs_json TEXT,
  listed_at TEXT
);
