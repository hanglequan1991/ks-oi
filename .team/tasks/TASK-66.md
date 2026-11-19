# TASK-66: Migration 0004 and DB helpers for last-checked time, per-file listing cache and batched seen marks

- id: TASK-66
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 1
- depends on: TASK-54, TASK-56, TASK-62 (all done). Disjoint from TASK-63 and TASK-65, so it can run in parallel with them.
- size: fits a 100k-token context (few files, one behaviour)

## Background
Budgeted runs need (a) "last successful check" per tab to pick the oldest first (never-synced first), (b) per-file `modified` text and tab list so unchanged files skip `listTabs`, and (c) a way to mark all listed tabs as seen without 450 separate D1 calls (the current runSync calls `markTabSeen` once per tab). The existing `sync_state.last_seen_at` is set on every listing, so it cannot serve as "last successful check".

Migration `sheet-rag/migrations/0004_sync_budget.sql` MUST be fully re-runnable (project rule, decision log: all migrations idempotent; the fake runner `test/fakes/migrations.ts applyMigrations` re-applies every file on each call and e2e TC-2, TC-3, TC-9 apply twice). So: no `ALTER TABLE`. Only:
- `CREATE TABLE IF NOT EXISTS sync_tab_checks (tab_key TEXT PRIMARY KEY, last_checked_at TEXT NOT NULL);` `tab_key` is the same key syncState uses for tabs, `keyOf(fileId, gid)` = `fileId:gid`.
- `CREATE TABLE IF NOT EXISTS sync_files (file_id TEXT PRIMARY KEY, file_name TEXT, modified TEXT, skip_sig TEXT, tabs_json TEXT, listed_at TEXT);`
`tabs_json` is a JSON array of `{gid, tabName}` after SKIP_TABS filtering; `skip_sig` is the fingerprint of the skip list used.
Lead decision (rework 1, supersedes the ALTER design): `last_checked_at` lives in `sync_tab_checks`, not as a `sync_state` column. `SyncStateRow.last_checked_at` stays (read via LEFT JOIN) so TASK-69's signatures do not change.

## Acceptance criteria
1. AC1: Migration 0004 has no ALTER, creates `sync_tab_checks` and `sync_files` with IF NOT EXISTS, and applying 0001 to 0004 in order TWICE on the fake D1 works (no error, no duplicate data). Existing migration specs stay green.
2. AC2: `SyncStateRow` keeps `last_checked_at: string | null`; `getSyncState` selects it with `LEFT JOIN sync_tab_checks c ON c.tab_key = s.source_file_id || ':' || s.source_gid` (`c.last_checked_at AS last_checked_at`); tabs with no check row read null (legacy rows too).
3. AC3: `markTabsChecked(db, keys: TabKey[], now): Promise<void>` upserts `sync_tab_checks.last_checked_at = now` for the given tabs in a single `db.batch` per call, only for tabs that have a `sync_state` row (`INSERT ... SELECT ?, ? WHERE EXISTS (SELECT 1 FROM sync_state WHERE source_file_id = ? AND source_gid = ?) ON CONFLICT (tab_key) DO UPDATE SET last_checked_at = excluded.last_checked_at`). Empty input makes no D1 call. It no longer touches `sync_state.updated_at`.
4. AC4: `recordTabSuccess` writes the sync_state success row and the `sync_tab_checks` upsert (same `now`) in one `db.batch`. `recordTabError` does not touch `sync_tab_checks` (comment: a failing tab is retried but sinks in the order only after a success elsewhere).
5. AC5: `syncHotel.ts` inline success row: the success batch in `syncHotel` also contains the `sync_tab_checks` upsert for the tab (same `now`, same SQL as recordTabSuccess), so a real run records the check time. The pinning test `inline success row in the batch matches recordTabSuccess on every column` stays and is extended to compare `sync_tab_checks` too.
6. AC6: `markTabsSeenBatch(db, tabs: Array<TabKey & { tabName: string }>, now)` runs the same upsert as `markTabSeen`, using `db.batch` in chunks of at most 50 statements; empty input makes no D1 call; per row identical to `markTabSeen` (does not reset hash, error, missing flag, nor touch `sync_tab_checks`). (Unchanged from the first version.)
7. AC7: Pure helper `pickOldestFirst<T extends TabKey>(tabs, state: Map<string, SyncStateRow>, limit)` (unchanged, reads `SyncStateRow.last_checked_at` from the joined state): never-checked (no row or null) first, then ascending `last_checked_at`, stable, `picked.length <= limit`, `deferred = tabs.length - picked.length`.
8. AC8: `sheet-rag/src/db/syncFiles.ts` with `getSyncFiles(db): Promise<Map<string, SyncFileRow>>` (one query) and `upsertSyncFile(db, row)`; `tabs_json` parsed defensively (invalid gives `tabs: null`, never throws). `SyncFileRow = { fileId; fileName; modified: string | null; skipSig: string | null; tabs: Array<{gid: string; tabName: string}> | null; listedAt: string | null }`. (Unchanged.)
9. AC9: All SQL uses bound parameters only.
10. AC10: After the rework the whole unit suite AND the Playwright node suite (`npx playwright test -c playwright.node.config.ts --project=chromium --trace off`) are green, in particular e2e TC-2, TC-3, TC-9. No e2e file needs editing: TC-1 and TC-2 only check required tables are present and out-of-scope prefixes (`crawl_`, `admin_`) are absent, so the new tables are allowed. If any e2e spec really fails because of an exact table set, stop and write a question instead of editing it.

## Unit tests to write
- [ ] `0004 applies after 0001-0003, twice, and creates sync_tab_checks and sync_files`: covers AC1 (`test/migrations/0004_sync_budget.spec.ts`; replace the old ALTER-based assertions)
- [ ] `getSyncState returns last_checked_at via the join, null for rows without a check`: covers AC2
- [ ] `markTabsChecked upserts only tabs with a sync_state row, in one batch, none for empty input`: covers AC3
- [ ] `recordTabSuccess sets last_checked_at and recordTabError leaves it`: covers AC4
- [ ] `syncHotel success batch writes sync_tab_checks` and the extended `inline success row in the batch matches recordTabSuccess on every column` (including sync_tab_checks): covers AC5
- [ ] `markTabsSeenBatch chunks 120 tabs into 3 batches and is a no-op for empty input`: covers AC6
- [ ] `markTabsSeenBatch keeps hash, error and missing_since like markTabSeen`: covers AC6
- [ ] `pickOldestFirst orders never-checked first then oldest, stable, respects limit and reports deferred`: covers AC7
- [ ] `syncFiles round trip, bad tabs_json gives null tabs`: covers AC8

## Files this task may touch
- `sheet-rag/migrations/0004_sync_budget.sql`
- `sheet-rag/src/db/syncState.ts`
- `sheet-rag/src/db/syncFiles.ts`
- `sheet-rag/src/sync/syncHotel.ts` (added in rework 1: only the success statement/batch; answer to Q1)
- `sheet-rag/test/sync/syncHotel.spec.ts` (added in rework 1)
- `sheet-rag/test/migrations/0004_sync_budget.spec.ts`
- `sheet-rag/test/db/syncState.spec.ts`
- `sheet-rag/test/db/syncFiles.spec.ts`
- Any existing spec that pins the exact column list of `sync_state` or the number of migrations (Grep; update deliberately).
- Shared: `src/db/syncState.ts` is read (not edited) by TASK-68, TASK-69 and TASK-70; `syncHotel.ts` is also edited by later tasks only after this one is done.

## Rework 1 (lead, 2026-11-19): what the dev must change
1. `migrations/0004_sync_budget.sql`: delete the ALTER and its header note; add `CREATE TABLE IF NOT EXISTS sync_tab_checks (tab_key TEXT PRIMARY KEY, last_checked_at TEXT NOT NULL)`; keep `sync_files` as is. Header comment: fully re-runnable.
2. `src/db/syncState.ts`: `SELECT_ALL_SQL` becomes `... FROM sync_state s LEFT JOIN sync_tab_checks c ON ...` with qualified columns (`s.`), `c.last_checked_at AS last_checked_at`; `MARK_CHECKED_SQL` becomes the INSERT ... SELECT ... WHERE EXISTS ... ON CONFLICT upsert into `sync_tab_checks` (bind: tab_key, now, fileId, gid; build the key with `keyOf`); export the check-upsert SQL/helper (for example `tabCheckStatement(db, key, now)`) so `syncHotel.ts` reuses the exact SQL; `RECORD_SUCCESS_SQL` loses the `last_checked_at` column again and `recordTabSuccess` runs `db.batch([successUpsert, checkUpsert])`. `recordTabError` and `markTabSeen*` unchanged.
3. `src/sync/syncHotel.ts`: add the `sync_tab_checks` upsert statement (from the syncState helper) to the batch next to `recordSuccessStatement`. Do not change anything else (the `sync_state` columns of the inline statement stay as they were before the first dev pass).
4. `src/db/syncFiles.ts`: no change expected (only if the join/shape requires it).
5. Specs: update `0004_sync_budget.spec.ts` (no ALTER; apply twice; new table), `syncState.spec.ts` (AC2-AC4 tests above), `syncHotel.spec.ts` (extend the pinning test and add the batch test).
6. Finish with: `npm test -- --run` (all green) and `npx playwright test -c playwright.node.config.ts --project=chromium --trace off` (all green, TC-2/3/9 included). Report both results in Dev notes.

## Dev notes (first pass, before rework 1; superseded where it mentions ALTER or last_checked_at as a column)
<!-- Written by dev. -->
- Done: migration `0004_sync_budget.sql` (ALTER with a header note that it is not re-runnable on its own, runner applies each file once; CREATE TABLE IF NOT EXISTS). `src/db/syncState.ts`: `last_checked_at` in the row type and select, `markTabsChecked`, `markTabsSeenBatch` (chunks of 50), `pickOldestFirst`, `recordTabSuccess` sets `last_checked_at`, `recordTabError` does not (comment added). `src/db/syncFiles.ts` new: `getSyncFiles`, `upsertSyncFile`, defensive `tabs_json` parse.
- Specs: `test/migrations/0004_sync_budget.spec.ts`, `test/db/syncState.spec.ts` (6 new tests), `test/db/syncFiles.spec.ts`. All green. The 0003 spec and the "applied twice" test only run 0001-0003, so they are unchanged and green. No spec pins the migration count.
- Full unit run: 500 passed, 1 failed: `test/sync/syncHotel.spec.ts > inline success row in the batch matches recordTabSuccess on every column`. Cause: `src/sync/syncHotel.ts` (lines ~106-117) has its own inline copy of the success upsert, which does not set `last_checked_at`, so it differs from `recordTabSuccess`. Not in this task's file list, so not edited.

## Questions
Q1 (technical, to lead): the real success path in runSync goes through the inline statement in `src/sync/syncHotel.ts`, not through `recordTabSuccess`. Without `last_checked_at` there, a successful tab never gets a check time, so AC3 is not met in production. Fix needs a one-line change in `src/sync/syncHotel.ts` (add `last_checked_at` as `?` with `args.now`, `excluded.last_checked_at` in the upsert) and the bind list, plus that file must be added to this task's file list (or assigned to another task). Who should make it? Until answered, the `syncHotel` inline-success test stays red.
A (lead): Yes. `src/sync/syncHotel.ts` and `test/sync/syncHotel.spec.ts` are added to this task's file list. The inline success batch must also write `sync_tab_checks` (see AC5 and Rework 1). Scope change: the check time moved from a `sync_state` column to the new table `sync_tab_checks` because an ALTER is not re-runnable and breaks e2e TC-2, TC-3, TC-9 and the idempotence rule.

## Dev notes (rework 1, dev)
- Done: `migrations/0004_sync_budget.sql` has no ALTER; creates `sync_tab_checks` and `sync_files` with IF NOT EXISTS. `src/db/syncState.ts`: `SELECT_ALL_SQL` LEFT JOINs `sync_tab_checks`; exported `tabCheckStatement(db, key, now)` (INSERT ... SELECT ... WHERE EXISTS ... ON CONFLICT upsert); `markTabsChecked` batches it; `recordTabSuccess` runs `db.batch([successRow, check])`; `recordTabError` and `markTabSeen*` unchanged. `src/sync/syncHotel.ts`: success batch ends with `tabCheckStatement(db, tab, now)` after the sync_state row.
- Specs: `test/migrations/0004_sync_budget.spec.ts` (applies 0001-0004 twice, keeps data, no ALTER), `test/db/syncState.spec.ts` (markTabsChecked writes only sync_tab_checks, one batch; recordTabSuccess is one 2-statement batch), `test/sync/syncHotel.spec.ts` (pinning test compares sync_tab_checks; new test: success writes the check row, invalid does not).
- `test/db/syncFiles.spec.ts` and `src/db/syncFiles.ts` unchanged.
- `npx playwright test -c playwright.node.config.ts --project=chromium --trace off`: 32 passed (TC-2, TC-3, TC-9 included), 0 failed.
- `env -u CLOUDFLARE_API_TOKEN npm test -- --run`: 504 passed, 13 failed. All 13 are in two files outside this task (see Questions).

## Review
Verdict: approve (lead, 2026-11-19).
- Migration 0004 has no ALTER, both tables CREATE IF NOT EXISTS; applied twice in spec and e2e TC-2/3/9 green (32 passed).
- getSyncState LEFT JOIN on `s.source_file_id || ':' || s.source_gid` with `c.last_checked_at`; legacy rows null (tested).
- `tabCheckStatement` is exported and reused by recordTabSuccess (one db.batch, success row first), markTabsChecked (one batch, empty is a no-op, guarded by WHERE EXISTS) and syncHotel's success batch. recordTabError untouched.
- pickOldestFirst: never-checked first, ascending, stable, limit/deferred correct. The pinning test is extended to sync_tab_checks and a syncHotel batch test exists.
- All SQL bound; only listed files changed. Full unit suite 69 files / 532 tests green.

## Questions
Q2 (technical, to lead, rework 1 of TASK-66): the unit suite is red in two files that TASK-66 does not touch, and both come from uncommitted work in the tree, not from this change:
- `test/sync/publicGoogleSource.spec.ts` > `listTabs parses names and gids including escapes and honours skipTabs` (`src/sync/publicGoogleSource.ts` is modified in the tree)
- `test/sync/skipTabsDoc.spec.ts` (untracked) > `deploy doc lists the ten recommended tab names and src has none of them` (`DEPLOY-hotel-dictionary.md` is modified)
Only these 2 of 68 files fail (13 tests); every file touched by TASK-66 is green. TASK-66's file list does not allow editing them. Which task owns these two files (probably TASK-63 or TASK-65, which run in parallel), and should TASK-66 be closed on its own green files? Until answered the status is `blocked: question`.
A (lead): TASK-64 owns `publicGoogleSource.ts`, `skipTabsDoc.spec.ts` and `DEPLOY-hotel-dictionary.md` (it was in progress then, now green). TASK-66 closes on its own green files. No scope or file-list change.
