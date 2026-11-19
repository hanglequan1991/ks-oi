# TASK-49: Sync state storage and per-tab change detection

- id: TASK-49
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-45, TASK-46, TASK-47
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/db/syncState.ts` exports `getSyncState(db): Promise<Map<string, SyncStateRow>>` (key `fileId:gid`), `markTabSeen`, `recordTabSuccess(db, {fileId,gid,hotelId,tabName,hash,now})` (clears last_error and missing_since), `recordTabError(db, {fileId,gid,tabName,error,now})` (keeps the old hash), and `markTabMissing(db, key, now, priorStatus)`. All use prepared statements with binds.
2. AC2: `src/sync/planSync.ts` exports `planSync({ tabs, state, hashes, force? })` (pure) returning `{ changed: SheetTab[]; unchanged: SheetTab[]; removed: SyncStateRow[]; restored: SheetTab[] }`. A tab is `changed` when new, when its stored hash differs, or when `force`; `unchanged` when the hash equals and no `last_error`... a tab whose last attempt errored with the same hash is `changed` (retry). `removed` = state rows (not already `missing_since`) absent from `tabs`. `restored` = tabs present again whose row has `missing_since` set (also returned in `changed`).
3. AC3: no tabs listed at all (`tabs.length === 0`) never produces `removed` (guard for STORY-14 AC13; the caller also treats a read failure as an abort).
4. AC4: re-running with identical hashes gives `changed = []` (STORY-14 AC10); editing one tab changes only that tab (AC11).

## Unit tests to write
- [ ] `new tab is changed`: covers AC2
- [ ] `same hash is unchanged, different hash is changed, force marks all changed`: covers AC2, AC4
- [ ] `tab with last_error and same hash is retried`: covers AC2
- [ ] `tab missing from list is removed, once`: covers AC2
- [ ] `returning tab is restored and changed`: covers AC2
- [ ] `empty tab list removes nothing`: covers AC3
- [ ] `only the edited tab is changed among three`: covers AC4
- [ ] `syncState db helpers round trip on fake D1 with migrations`: covers AC1

## Files this task may touch
- `sheet-rag/src/db/syncState.ts`
- `sheet-rag/src/sync/planSync.ts`
- `sheet-rag/test/db/syncState.spec.ts`
- `sheet-rag/test/sync/planSync.spec.ts`

## Dev notes

## Review

## Questions
