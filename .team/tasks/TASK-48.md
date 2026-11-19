# TASK-48: Parsed hotel record type and validation

- id: TASK-48
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-59 (adds test/sync to the vitest include list; must run first)
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

- Written: `src/sync/record.ts` (types only), `src/sync/validate.ts` (`validateHotel`, codes as in AC2 plus the two warning codes), `test/sync/validate.spec.ts` (9 tests, all pass).
- Choices: `ValidationResult` is `{ ok: true; warnings }` or `{ ok: false; errors; warnings }`, so warnings are returned on both branches. `bedType` is `string`, `sizeM2` and `maxGuests` are `number`. Room name counts as empty when it folds to nothing. Error order: stars, images by index, then rooms by index (name check, then price).
- Verified red then green with a temporary config in the scratchpad (outside the repo): 9 of 9 pass, `tsc` clean for the new files.
- The official command does not run `test/sync/`, see Questions.
- Unrelated to this task: the full official run shows 1 failure in `test/db/apiSample.spec.ts` ("keeps the default settings from the migration").

## Review

Verdict: approve (2026-11-19). AC1-AC5 covered by validate.spec.ts (9 tests). Price must be a positive safe integer (0, negative, 1.5, NaN rejected), null allowed; stars 1..5 integer or null; https-only images; room duplicates folded; all errors collected in stable order; description/facilities only warn. Imports only domain/fold and types. Only listed files changed.

## Questions

**Q1 (technical, for lead):** `npm test -- --run` never runs `test/sync/validate.spec.ts`. `sheet-rag/vitest.unit.config.mts` has an `include` list with no `test/sync/**` entry, so vitest reports "No test files found" for this file. That config is not in TASK-48's file list, so I did not edit it. Please approve adding `"test/sync/**/*.spec.ts"` to that `include` list (or tell me another way to run it). Until then the required unit command cannot show TASK-48's tests as passing. Note: `test/sync/csv.spec.ts` and `test/sync/hash.spec.ts` also exist and are missing their modules, so the same include change will affect them too (they belong to other tasks).

A (lead, 2026-11-19): handled by TASK-59, which runs first and adds `test/sync/**/*.spec.ts` to the include list (it also covers csv.spec.ts and hash.spec.ts, owned by other tasks). Do not edit the config; your code stays as written.
