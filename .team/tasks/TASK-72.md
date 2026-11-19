# TASK-72: Storage for the read-skip: file_modified and parser_version on sync_tab_checks (migration 0004 amendment)

- id: TASK-72
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-66 (done), TASK-69 (done). No dependency on TASK-70; disjoint files, may run in parallel with it.
- size: fits a 100k-token context (few files, one behaviour)

## Background
TASK-73 lets runSync skip READING (readCsv) a tab when the Drive file `modified` text is unchanged since that tab's last successful check and the parser version is unchanged. For that, each tab needs two stored facts: the file `modified` observed at its last successful check or apply, and the PARSER_VERSION in force then. They go on `sync_tab_checks` (same row as `last_checked_at`).

Migration 0004 is NOT yet applied to the remote database (owner confirmed), so it is amended in place: add the two columns to the existing `CREATE TABLE IF NOT EXISTS sync_tab_checks`. Keep it idempotent; no ALTER, no migration 0005. (Reason: an ALTER is not re-runnable and 0004 has never been applied anywhere remote. Local test databases are rebuilt from the migration files.)

Design:
- `sync_tab_checks` gains `file_modified TEXT` (nullable) and `parser_version TEXT` (nullable).
- `SyncStateRow` gains `file_modified: string | null` and `parser_version: string | null`; `getSyncState` selects them from the LEFT JOIN (NULL when no check row).
- `tabCheckStatement(db, key, now, meta?)` where `meta?: { fileModified: string | null; parserVersion: string }`. With `meta`, the upsert also sets `file_modified` and `parser_version`. Without `meta`, it sets only `last_checked_at` and LEAVES the two columns as they are (a failed attempt must not move them). Use two SQL constants if simpler.
- `markTabsChecked(db, keys, now)`: `keys` may carry the optional `meta` per key (type `TabKey & { meta?: TabCheckMeta }`); behaviour per key as above; still one batch, still no call on empty input.
- `recordTabSuccess` args gain optional `fileModified` and `parserVersion`; when `parserVersion` is given it passes `meta` to `tabCheckStatement`.
- `syncHotel` input (`SyncHotelInput`) gains optional `fileModified?: string | null` and `parserVersion?: string`; the inline success batch passes the same `meta` to `tabCheckStatement` when `parserVersion` is given. Existing callers that pass neither behave exactly as before.

## Acceptance criteria
1. AC1: Migration 0004 defines `file_modified` and `parser_version` on `sync_tab_checks`, both nullable; applying the file twice still succeeds; no ALTER statement in the file.
2. AC2: `getSyncState` returns `file_modified` and `parser_version` per tab (null for a tab with no check row or a row written without meta).
3. AC3: `tabCheckStatement` with meta stores both columns and `last_checked_at`; a second call without meta updates `last_checked_at` and keeps both columns unchanged.
4. AC4: `markTabsChecked` writes meta per key when given and leaves columns alone when not given, in one batch; empty input makes no D1 call; keys without a `sync_state` row are ignored (as today).
5. AC5: `recordTabSuccess` with `fileModified` and `parserVersion` stores them; without them behaves as before.
6. AC6: `syncHotel` with `fileModified` and `parserVersion` stores them in `sync_tab_checks` in the same batch as the success row; without them behaves as before; a failed apply stores nothing in these columns.
7. AC7: A `fileModified` of `null` is stored as NULL (round-trips to null).
8. AC8: All existing specs touching `sync_tab_checks`, `markTabsChecked`, `tabCheckStatement` stay green; any pin of the table columns is updated deliberately. `pickOldestFirst` and `last_checked_at` semantics unchanged.

## Unit tests to write
- [ ] `0004 defines file_modified and parser_version and stays re-runnable`: covers AC1
- [ ] `getSyncState exposes file_modified and parser_version (null without a check row)`: covers AC2
- [ ] `tabCheckStatement with meta stores columns; without meta keeps them`: covers AC3, AC7
- [ ] `markTabsChecked writes meta per key, leaves columns without meta, one batch`: covers AC4
- [ ] `recordTabSuccess stores fileModified and parserVersion when given`: covers AC5
- [ ] `syncHotel stores fileModified and parserVersion with the success batch; failed apply stores none`: covers AC6
- [ ] existing 0004, syncState and syncHotel specs stay green: covers AC8

## Files this task may touch
- `sheet-rag/migrations/0004_sync_budget.sql`
- `sheet-rag/src/db/syncState.ts`
- `sheet-rag/src/sync/syncHotel.ts`
- `sheet-rag/test/migrations/0004_sync_budget.spec.ts`
- `sheet-rag/test/db/syncState.spec.ts`
- `sheet-rag/test/sync/syncHotel.spec.ts`
- Shared: none with TASK-70. `runSync.ts` (TASK-73) calls these helpers afterwards; it is not touched here (its existing calls stay type-valid because `meta` is optional).

## Dev notes
<!-- Written by dev. -->

## Review
<!-- Written by lead. -->

## Questions
