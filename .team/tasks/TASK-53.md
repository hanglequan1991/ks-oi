# TASK-53: syncHotel: validate, then apply one hotel atomically

- id: TASK-53
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-59 (vitest include for test/sync, must run first), TASK-48, TASK-49, TASK-50, TASK-51, TASK-52
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/syncHotel.ts` exports `syncHotel(db, { tab, record, hash, now, autoPublish }): Promise<SyncHotelResult>` with result `{ outcome: 'created'|'updated'|'invalid'|'error'; hotelId; issues?: ValidationIssue[]; unmappedFacilities: string[] }`.
2. AC2: it first runs `validateHotel`. An invalid record writes NOTHING to hotels, rooms, rules, images or facilities and returns `invalid` with the issues; it records the error via `recordTabError` (hash not advanced). If the hotel was already published its data is unchanged (STORY-14 AC5, AC7).
3. AC3: a valid record is applied with ONE `db.batch([...])`: city, hotel, images, facilities, rooms, rules (TASK-50/51 builders), then overrides and the data_version bump (TASK-52), in that order; then `recordTabSuccess` is written in the same batch (STORY-14 AC8: all or nothing).
4. AC4: if the batch throws (test: fake D1 wrapper that fails the third statement), nothing from this hotel is visible (the D1 batch is a transaction; the test must use the fake's batch semantics, and dev notes say if the fake is not transactional then the fake is fixed in `test/fakes/d1.ts` only with lead approval via a Question) and the result is `error`, with the error text stored via `recordTabError`.
5. AC5: slug for a new hotel: `${citySlug}-${foldedName with dashes}`, with `-2`, `-3` appended while another hotel has it; an existing hotel keeps its slug.
6. AC6: when the hotel exists with `sync_state.hidden_by_sync = 1` (tab returned), status is restored to `prior_status` (if present), `hidden_by_sync` cleared (STORY-14 AC9 restore). A hotel hidden by the owner (`hidden_by_sync = 0`) stays hidden.
7. AC7: syncing the same record twice returns `updated` and leaves all tables identical except `synced_at` (STORY-14 AC10 at row level); `created` on the first run.

## Unit tests to write
- [ ] `valid record creates hotel, rooms, rules, images`: covers AC1, AC3
- [ ] `invalid record writes nothing and reports issues`: covers AC2
- [ ] `invalid change to a published hotel leaves published data unchanged`: covers AC2
- [ ] `failure mid batch leaves no partial data and reports error`: covers AC4
- [ ] `slug collision gets suffix, rename of tab keeps id and slug`: covers AC5
- [ ] `returning tab restores prior status only when hidden by sync`: covers AC6
- [ ] `second identical run is updated with identical rows`: covers AC7
- [ ] `override survives a sync`: covers AC3

## Files this task may touch
- `sheet-rag/src/sync/syncHotel.ts`
- `sheet-rag/test/sync/syncHotel.spec.ts`

## Dev notes
- Red: spec failed on the missing module. Green: 8/8 in test/sync/syncHotel.spec.ts; full unit suite 60 files, 433 tests pass.
- The sync_state success row is an inline statement in the hotel batch (same SQL as recordTabSuccess in src/db/syncState.ts), because recordTabSuccess runs its own query and cannot join the batch. AC3 requires it in the batch. The SQL is duplicated; if RECORD_SUCCESS_SQL changes, change this copy too.
- The restore of a hidden hotel is two statements in the batch, after the sheet writes and before the overrides: status = prior_status (only when hidden_by_sync = 1 and prior_status is a valid status), then hidden_by_sync = 0 and prior_status = NULL. An owner-hidden hotel (hidden_by_sync = 0) is not touched.
- data_version is bumped on every successful apply, so a second identical run changes settings.data_version. The identical-rows test compares hotels, images, facilities, rooms, rules and sync_state, and leaves out synced_at and the settings row.
- Open point: if hidden_by_sync = 1 and prior_status is NULL, the status stays 'hidden' and only the flag is cleared. Not covered by the task; lead to decide.
- Failure test uses a wrapper whose batch fails the third statement; the fake batch rolls back, so test/fakes/d1.ts is unchanged.

## Review

## Questions
