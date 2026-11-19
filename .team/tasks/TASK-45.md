# TASK-45: Migration 0003: sync_state, sync_runs and the sync_auto_publish setting

- id: TASK-45
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `migrations/0003_sync.sql` creates `sync_state` (PRIMARY KEY (source_file_id, source_gid); columns: source_file_id, source_gid, hotel_id (nullable), tab_name, hash, last_seen_at, missing_since (nullable), hidden_by_sync INTEGER NOT NULL DEFAULT 0, prior_status (nullable), last_error (nullable), updated_at) and `sync_runs` (id TEXT PRIMARY KEY, kind, started_at, finished_at, created, updated, failed, hidden, unchanged INTEGER DEFAULT 0, notes TEXT), all with IF NOT EXISTS.
2. AC2: it inserts `('sync_auto_publish','true')` into `settings` with INSERT OR IGNORE (decision 2026-11-19: synced hotels are published automatically; the owner can flip the setting to 'false'); a value the owner already set (for example 'false') is not overwritten on re-run.
3. AC3: applying 0001, 0002, 0003 in order on the fake D1, twice, succeeds and leaves one row per settings key.
4. AC4: existing migration specs (0001, 0002) still pass unchanged.

## Unit tests to write
- [ ] `0003 creates sync_state and sync_runs with the listed columns`: covers AC1
- [ ] `0003 seeds sync_auto_publish true and keeps an owner-set false`: covers AC2
- [ ] `all migrations twice are idempotent`: covers AC3
- [ ] run `npm test -- --run test/migrations`: covers AC4

## Files this task may touch
- `sheet-rag/migrations/0003_sync.sql`
- `sheet-rag/test/migrations/0003_sync.spec.ts`

## Dev notes
- Red: `0003_sync.spec.ts` failed with ENOENT on `migrations/0003_sync.sql`. Green after adding the migration: `test/migrations` 3 files, 18 tests pass (0001 and 0002 specs unchanged).
- Tests: columns checked via `PRAGMA table_info`; sync_auto_publish seeded true, owner-set false kept on re-run; 0001-0003 applied twice.

## Review

Verdict: approve (2026-11-19). AC1-AC4 covered by test/migrations/0003_sync.spec.ts (columns via PRAGMA, owner-set false kept, 0001-0003 twice gives 6 settings rows); full suite green. Migration uses IF NOT EXISTS everywhere and INSERT OR IGNORE for sync_auto_publish='true'. Only the two listed files changed.

## Questions
