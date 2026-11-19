# TASK-66: Migration 0004 and DB helpers for last-checked time, per-file listing cache and batched seen marks

- id: TASK-66
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-54, TASK-56, TASK-62 (all done). Disjoint from TASK-63 and TASK-65, so it can run in parallel with them.
- size: fits a 100k-token context (few files, one behaviour)

## Background
Budgeted runs need (a) "last successful check" per tab to pick the oldest first (never-synced first), (b) per-file `modified` text and tab list so unchanged files skip `listTabs`, and (c) a way to mark all listed tabs as seen without 450 separate D1 calls (the current runSync calls `markTabSeen` once per tab). The existing `sync_state.last_seen_at` is set on every listing, so it cannot serve as "last successful check".

Migration `sheet-rag/migrations/0004_sync_budget.sql` (re-runnable like 0003, IF NOT EXISTS where possible):
- `ALTER TABLE sync_state ADD COLUMN last_checked_at TEXT;` (SQLite has no `ADD COLUMN IF NOT EXISTS`; lead decision: the migration runner applies each file once, so a plain ALTER is fine. State this in the SQL header comment.)
- `CREATE TABLE IF NOT EXISTS sync_files (file_id TEXT PRIMARY KEY, file_name TEXT, modified TEXT, skip_sig TEXT, tabs_json TEXT, listed_at TEXT);`
`tabs_json` is a JSON array of `{gid, tabName}` and holds the list after SKIP_TABS filtering; `skip_sig` is the fingerprint of the skip list used to produce it.

## Acceptance criteria
1. AC1: Migration file exists with the content above, and applying 0001 to 0004 in order on the fake D1 works. The existing migration specs stay green.
2. AC2: `SyncStateRow` gains `last_checked_at: string | null`; `getSyncState` selects it; rows created before the migration read as null.
3. AC3: New `markTabsChecked(db, keys: Array<TabKey>, now): Promise<void>` sets `last_checked_at = now` (and `updated_at`) for the given tabs, as a single `db.batch` per call, ignoring tabs without a row. `recordTabSuccess` also sets `last_checked_at` (same `now`). `recordTabError` does not touch it, so a failing tab is retried but sinks in the order only after a success elsewhere (documented in a code comment).
4. AC4: New `markTabsSeenBatch(db, tabs: Array<TabKey & { tabName: string }>, now): Promise<void>` runs the same upsert as `markTabSeen`, using `db.batch` in chunks of at most 50 statements; empty input makes no D1 call. Behaviour per row is identical to `markTabSeen` (does not reset hash, error or missing flag).
5. AC5: New pure helper `pickOldestFirst<T extends TabKey>(tabs: T[], state: Map<string, SyncStateRow>, limit: number): { picked: T[]; deferred: number }`: tabs with no state row or null `last_checked_at` first, then ascending `last_checked_at`; ties keep listing order (stable). `picked.length <= limit`; `deferred = tabs.length - picked.length`.
6. AC6: New `sheet-rag/src/db/syncFiles.ts` with `getSyncFiles(db): Promise<Map<string, SyncFileRow>>` (one query) and `upsertSyncFile(db, row)`; `tabs_json` is parsed defensively (invalid JSON gives `tabs: null`, never throws). `SyncFileRow = { fileId; fileName; modified: string | null; skipSig: string | null; tabs: Array<{gid: string; tabName: string}> | null; listedAt: string | null }`.
7. AC7: All SQL uses bound parameters only.

## Unit tests to write
- [ ] `0004 applies after 0001-0003 and adds last_checked_at and sync_files`: covers AC1 (new `test/migrations/0004_sync_budget.spec.ts`, follow `0003_sync.spec.ts`)
- [ ] `getSyncState returns last_checked_at, null for legacy rows`: covers AC2
- [ ] `markTabsChecked updates only the given tabs in one batch`: covers AC3
- [ ] `recordTabSuccess sets last_checked_at and recordTabError leaves it`: covers AC3
- [ ] `markTabsSeenBatch chunks 120 tabs into 3 batches and is a no-op for empty input`: covers AC4
- [ ] `markTabsSeenBatch keeps hash, error and missing_since like markTabSeen`: covers AC4
- [ ] `pickOldestFirst orders never-checked first then oldest, stable, respects limit and reports deferred`: covers AC5
- [ ] `syncFiles round trip, bad tabs_json gives null tabs`: covers AC6

## Files this task may touch
- `sheet-rag/migrations/0004_sync_budget.sql` (new)
- `sheet-rag/src/db/syncState.ts`
- `sheet-rag/src/db/syncFiles.ts` (new)
- `sheet-rag/test/migrations/0004_sync_budget.spec.ts` (new)
- `sheet-rag/test/db/syncState.spec.ts`
- `sheet-rag/test/db/syncFiles.spec.ts` (new)
- Any existing spec that pins the exact column list of `sync_state` or the number of migrations (find with Grep; update deliberately).
- Shared: `src/db/syncState.ts` is read (not edited) by TASK-68, TASK-69 and TASK-70, which run after this task.

## Dev notes
<!-- Written by dev. -->

## Review
<!-- Written by lead. -->

## Questions
