# TASK-52: Overrides re-application and data_version bump

- id: TASK-52
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-59 (adds test/sync to the vitest include list; must run first)
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
- Implemented `buildOverrideStatements(db, hotelId)` as a synchronous builder: one fixed UPDATE per whitelisted pair (8 pairs), guarded by EXISTS so a missing row or unusable value changes nothing. Column names come from a constant whitelist only.
- `stars` also requires 1 to 5 and `base_price` requires >= 0, so the CHECK constraints never fail the batch. `stars` and `base_price` must be digits only; anything else is skipped.
- `buildDataVersionStatement(db)` is an upsert: missing creates '1'; numeric increments; non-numeric (including '') resets to 1. Stored as TEXT.
- Tests: 9 cases in `test/sync/overrides.spec.ts` (the 6 listed plus stars, status-valid, and hotel-scope isolation). Full unit suite: 59 files, 420 tests passing.

## Review

Verdict: approve

- AC1-AC5 each covered by a meaningful test; full suite green (59 files / 420 tests, run by coordinator). Only the two listed files changed by this task.
- SQL is 8 fixed UPDATEs built from a constant WHITELIST; override field name is only a bound parameter (?2), never concatenated. Non-whitelisted fields (name, source_hash) are tested as ignored.
- EXISTS guard: missing room / unusable value leaves the sheet value (tested). `overrides.value` is NOT NULL so no NULL can be written into a NOT NULL column.
- Extra guards are sensible: stars 1..5 mirrors the CHECK constraint, base_price >= 0 mirrors its CHECK; digits-only means "1,200,000" or "4.0" is skipped (consistent with AC2 "does not cast"). No valid integer override is dropped.
- Ordering (overrides after sheet writes, then data_version) is the caller's job and is stated in TASK-53 AC3; not testable here.
- Non-blocking: no test for stars 0/6 or negative base_price being skipped. Optional.

## Questions
