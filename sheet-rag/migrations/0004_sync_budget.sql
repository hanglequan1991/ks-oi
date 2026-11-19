-- migrations/0004_sync_budget.sql
-- Sync budget support (STORY-14, TASK-66): last successful check per tab, and a per-file listing cache.
-- Fully re-runnable: every statement is CREATE TABLE IF NOT EXISTS, so applying it twice is safe.

-- Time of the last successful check of each tab (set by recordTabSuccess, syncHotel and markTabsChecked).
-- tab_key = keyOf(fileId, gid), i.e. `fileId:gid`. A tab with no row was never checked successfully.
-- A failed tab keeps its old row (unlike last_seen_at).
-- file_modified and parser_version (TASK-72) are set only by a successful check or apply, together
-- with last_checked_at, so a failed attempt never moves them. runSync skips reading a tab whose
-- file_modified and parser_version are unchanged. NULL means no meta was recorded for the tab.
-- This table was amended in place (0004 was never applied remotely), so the file stays re-runnable.
CREATE TABLE IF NOT EXISTS sync_tab_checks (
  tab_key TEXT PRIMARY KEY,                -- `fileId:gid`
  last_checked_at TEXT NOT NULL,
  file_modified TEXT,                      -- Drive modifiedTime of the file at the last success
  parser_version TEXT                      -- PARSER_VERSION in force at the last success
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
