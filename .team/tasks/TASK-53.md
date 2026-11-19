# TASK-53: syncHotel: validate, then apply one hotel atomically

- id: TASK-53
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 1
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
- Rework 1 (done): restore sets status to prior_status when it is review or published, else 'review' (NULL, invalid or 'hidden'), when hidden_by_sync = 1. Clears the flag and prior_status as before. Tests added: prior_status NULL (-> review), prior_status 'review' (-> review). Existing published case kept.
- Rework 1 (done): test pins the inline sync_state success row against recordTabSuccess. Two fake DBs from the same seeded state (old hash, missing_since, last_error); after one syncHotel and one recordTabSuccess the whole sync_state row is equal, with last_error and missing_since NULL in both.
- Full unit suite after rework: 60 files, 436 tests pass. No change to chunking or data_version.
- Failure test uses a wrapper whose batch fails the third statement; the fake batch rolls back, so test/fakes/d1.ts is unchanged.

## Review
Verdict: rework

Good: validate first, invalid writes nothing and calls recordTabError (hash kept); one `db.batch` in the order city/hotel/images/facilities/rooms/rules, restore, overrides, data_version, sync_state success; batch failure returns `error` with recordTabError; slug with -2/-3 for new ids only, existing keep slug; owner-hidden stays hidden; only listed files changed.

Rework notes:
1. Bug (the dev's open point): with `hidden_by_sync = 1` and `prior_status` NULL (or not a valid status), `restoreStatements` clears the flag but leaves the hotel `hidden` forever, with no marker that sync hid it. Fix: in the first restore statement, when `hidden_by_sync = 1`, set status to `prior_status` if it is one of review/published, and otherwise to `'review'` (never auto-publish an unknown prior state). Also treat a stored prior_status of `'hidden'` as `'review'` (sync would not have recorded hidden as a prior state worth restoring to). Overrides still run after and win.
2. Add tests in `syncHotel.spec.ts` for hidden_by_sync = 1 with prior_status NULL (expect status `review`, flag cleared, prior_status NULL) and with prior_status `'review'`.
3. Duplicated success SQL: accept only with a pin. Add a test that runs `syncHotel` on one tab and `recordTabSuccess` (same hotelId, tab_name, hash, now) on a second identical DB state or tab, then asserts the resulting `sync_state` rows are equal on every column except the key (or equal after a prior error row, including that last_error and missing_since are cleared in both). The code comment pointing to RECORD_SUCCESS_SQL stays.
4. Judged, no change: (a) chunking is wrong here because it would break all-or-nothing (AC3/AC4); D1 has no statement-count cap and a hotel with hundreds of rooms/rules is hundreds of small statements, well under 30 s. The only 100 KB risk is a single oversized text cell (Sheets allows 50,000 chars per cell, multi-byte Vietnamese can exceed 100 KB); the batch would then throw and syncHotel already returns `error` with the message stored and the hash not advanced, so the tab is retried and reported, nothing partial is written. Optional hardening belongs in TASK-50/51 validation (cap cell length), not here. (b) data_version bumping on every apply is fine: planSync (src/sync/planSync.ts) puts a tab in `changed` only when the hash differs, it is new, forced, restored or has last_error, so an unchanged tab never reaches syncHotel and caches are not invalidated by no-op runs. The test comment that the identical-rows test excludes the settings row is accurate.

## Questions
