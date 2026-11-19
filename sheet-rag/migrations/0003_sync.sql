-- migrations/0003_sync.sql
-- Sync state and run log for the Google Sheets sync (technical-design.html section 3.3).
-- Every statement is re-runnable: IF NOT EXISTS, and INSERT OR IGNORE for the setting.
-- Decision 2026-11-19: synced hotels are published automatically. The owner can set
-- sync_auto_publish to 'false'; a re-run never overwrites that value.

CREATE TABLE IF NOT EXISTS sync_state (
  source_file_id TEXT NOT NULL,            -- Google Sheets file id
  source_gid TEXT NOT NULL,                -- tab id inside the file
  hotel_id TEXT,                           -- NULL until the tab maps to a hotel
  tab_name TEXT,
  hash TEXT,                               -- content hash of the last applied tab
  last_seen_at TEXT,
  missing_since TEXT,                      -- NULL = tab present on the last run
  hidden_by_sync INTEGER NOT NULL DEFAULT 0,  -- 1 = sync hid the hotel, so it may unhide it
  prior_status TEXT,                       -- hotel status before sync changed it
  last_error TEXT,
  updated_at TEXT,
  PRIMARY KEY (source_file_id, source_gid)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  kind TEXT,                               -- e.g. scheduled, manual, folder
  started_at TEXT,
  finished_at TEXT,
  created INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  unchanged INTEGER DEFAULT 0,
  notes TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('sync_auto_publish', 'true');
