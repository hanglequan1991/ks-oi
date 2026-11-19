-- migrations/0004_sync_budget.sql
-- Sync budget support (STORY-14, TASK-66): last successful check per tab, and a per-file listing cache.
-- Re-run note: SQLite has no ADD COLUMN IF NOT EXISTS, so the ALTER below is NOT re-runnable on its own.
-- Lead decision: the migration runner applies each file once, so a plain ALTER is fine.
-- The CREATE TABLE is re-runnable (IF NOT EXISTS).

-- Time of the last successful check of the tab (set by recordTabSuccess and markTabsChecked).
-- NULL = never checked successfully. Unlike last_seen_at, a failed tab keeps its old value.
ALTER TABLE sync_state ADD COLUMN last_checked_at TEXT;

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
