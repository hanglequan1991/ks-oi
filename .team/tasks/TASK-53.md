# TASK-53: syncHotel: validate, then apply one hotel atomically

- id: TASK-53
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
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

## Review

## Questions
