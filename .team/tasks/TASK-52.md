# TASK-52: Overrides re-application and data_version bump

- id: TASK-52
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: none
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/overrides.ts` exports `buildOverrideStatements(db, hotelId): D1PreparedStatement[]` that re-applies every `overrides` row of the hotel after the sheet writes, using a fixed whitelist of `(entity, field)` pairs: hotels: `description_vi`, `description_en`, `address`, `area`, `stars`, `status`; rooms (entity_id = room id): `description`, `base_price`. A row outside the whitelist is ignored (never builds dynamic column names from data).
2. AC2: `stars` and `base_price` override values (stored as TEXT) are cast to integers; a value that does not cast is skipped. `status` overrides apply only if one of review, published, hidden.
3. AC3: an override for a room that no longer exists changes nothing and raises no error.
4. AC4: `buildDataVersionStatement(db)` returns a statement that increments `settings.data_version` as an integer, creating it at 1 if missing; a non-numeric value resets to 1.
5. AC5: executed on the fake D1 after sheet-like writes, an override survives (value equals the override, not the sheet) and re-running is idempotent.

## Unit tests to write
- [ ] `description override wins over the sheet value`: covers AC1, AC5
- [ ] `room base_price override applies, bad cast skipped`: covers AC1, AC2
- [ ] `non-whitelisted field and invalid status ignored`: covers AC1, AC2
- [ ] `override for a missing room does nothing`: covers AC3
- [ ] `data_version increments, creates and repairs`: covers AC4
- [ ] `running twice is idempotent`: covers AC5

## Files this task may touch
- `sheet-rag/src/sync/overrides.ts`
- `sheet-rag/test/sync/overrides.spec.ts`

## Dev notes

## Review

## Questions
