# TASK-48: Parsed hotel record type and validation

- id: TASK-48
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: none
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/record.ts` exports the contract between the parser and the writer: `ParsedHotel = { stars: number|null; address: string|null; area: string|null; descriptionVi: string|null; descriptionEn: string|null; images: string[]; facilities: string[]; rooms: ParsedRoom[]; hotelRules: string[] }` and `ParsedRoom = { name: string; basePrice: number|null; bedType?; sizeM2?; view?; maxGuests?; description?: string|null; rules: string[] }`. Rule strings are verbatim text. Hotel `name`, city and ids are not in the record (they come from `SheetTab`).
2. AC2: `src/sync/validate.ts` exports `validateHotel(h: ParsedHotel): { ok: true } | { ok: false; errors: ValidationIssue[] }` with `ValidationIssue = { code, field, message }`. Errors: `price_invalid` (price present but not a positive safe integer), `stars_range` (not integer 1..5), `image_not_https` (url not parseable or not https), `room_duplicate` (same room name after fold, STORY-14 AC5), `room_name_empty`.
3. AC3: a missing price (`null`) is valid (STORY-14 AC3); missing description or facilities is a warning only: `validateHotel` also returns `warnings` array (`description_missing`, `facilities_missing`) and never fails for them.
4. AC4: all issues are collected, not just the first. Output is deterministic (stable order).
5. AC5: pure code; imports only `src/domain/fold.ts` and types.

## Unit tests to write
- [ ] `valid record passes, null price allowed`: covers AC3
- [ ] `price 0, negative, 1.5, NaN each give price_invalid`: covers AC2
- [ ] `stars 0 and 6 and 3.5 give stars_range, null passes`: covers AC2
- [ ] `http and garbage image urls give image_not_https`: covers AC2
- [ ] `duplicate room name (case and accent differences) gives room_duplicate`: covers AC2
- [ ] `several errors are all reported in stable order`: covers AC4
- [ ] `missing description and facilities only warn`: covers AC3

## Files this task may touch
- `sheet-rag/src/sync/record.ts`
- `sheet-rag/src/sync/validate.ts`
- `sheet-rag/test/sync/validate.spec.ts`

## Dev notes

## Review

## Questions
