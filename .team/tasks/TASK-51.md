# TASK-51: Statement builders for rooms and booking rules

- id: TASK-51
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-59 (vitest include for test/sync, must run first), TASK-48 (record type), TASK-47 (hash helpers)
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/writeRooms.ts` exports `async buildRoomStatements(db, { hotelId, record, now }): Promise<D1PreparedStatement[]>`; nothing is executed.
2. AC2: room ids are stable: `sha256(hotelId + ':' + foldText(name))` first 16 hex, so a re-run updates in place and a room keeps its id. Rooms are written with `INSERT ... ON CONFLICT(id) DO UPDATE`; `source='sheet'`, `position` = sheet order.
3. AC3: `base_price` is the sheet BASE price, whole VND, or NULL when the sheet has none (STORY-14 AC3). No service fee is ever applied here.
4. AC4: sheet rooms no longer in the record are deleted (`source='sheet'` only; rooms with `source='mytour'` are never touched). Deleting a room cascades its room-level rules.
5. AC5: booking rules: all rules of the hotel with ids derived from sha256(hotelId + ':' + (roomId or 'hotel') + ':' + index) are deleted and re-inserted with `raw_text` exactly as given (not trimmed, no summarising), `room_id` NULL for hotel level and the matching room id for room level, `synced_at = now`, `status='review'`. Structured columns stay NULL.
6. AC6: running twice gives identical rows apart from nothing else changing (idempotent; `synced_at` equals the given `now`).
7. AC7: text with quotes, emoji, Vietnamese and newlines round-trips byte for byte.

## Unit tests to write
- [ ] `rooms inserted with base price and null price kept null`: covers AC2, AC3
- [ ] `room ids are stable across runs and sheet order is position`: covers AC2
- [ ] `removed sheet room deleted, mytour room kept`: covers AC4
- [ ] `hotel and room level rules attached correctly with synced_at`: covers AC5
- [ ] `rule text is stored verbatim including newlines and Vietnamese`: covers AC5, AC7
- [ ] `second identical run leaves tables identical`: covers AC6

## Files this task may touch
- `sheet-rag/src/sync/writeRooms.ts`
- `sheet-rag/test/sync/writeRooms.spec.ts`

## Dev notes
- Added `src/sync/writeRooms.ts` (`buildRoomStatements`, returns prepared statements only). Order: delete removed sheet rooms (json_each on kept ids), upsert rooms (`WHERE rooms.source = 'sheet'` guard), delete hotel's rules, insert rules.
- Rule ids use the first 16 hex of sha256 (same width as hotel and room ids). Room `name_search` = foldText(name). Bed type, size, view, max guests and description are copied from the record when present.
- Tests: 6 in `test/sync/writeRooms.spec.ts` on the fake D1 with real migrations. Full unit suite: 56 files, 394 tests pass.

## Review

## Questions
