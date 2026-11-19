# TASK-50: Statement builders for city, hotel, images and facilities

- id: TASK-50
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-45, TASK-48 (record type), TASK-47 (hotelIdFor)
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/writeHotel.ts` exports `buildHotelStatements(db, ctx): D1PreparedStatement[]` where `ctx = { tab: SheetTab; record: ParsedHotel; hotelId; now: string; autoPublish: boolean; existingStatus: 'review'|'published'|'hidden'|null; hash: string }`. It does not execute anything.
2. AC2: city: `INSERT ... ON CONFLICT(slug) DO NOTHING` from `tab.fileName`; city slug = foldText with spaces to `-`; `name_vi` = fileName (STORY-14 AC1).
3. AC3: hotel: `INSERT ... ON CONFLICT(id) DO UPDATE` of name (tab name), `name_search` = foldText(name), stars, address, area, descriptions, source_file_id, source_gid, source_hash, synced_at. The slug is generated once (city-aware, de-duplicated with a numeric suffix is the caller's `ctx.slug`, passed in) and never updated on conflict. `rooms_synced_at` and `facilities_synced_at` set to `now`.
4. AC4: status policy: new hotel gets `published` if `autoPublish` else `review`; an existing hotel keeps its status (never downgrades or un-hides an owner decision). Test through the fake D1 by executing the statements.
5. AC5: images: delete all rows of the hotel then insert `(hotel_id,url,position)` in sheet order; duplicates dropped keeping first.
6. AC6: facilities: delete rows with `source='sheet'` for the hotel; for each label, fold it and match against `facility_catalog.synonyms` (JSON array of folded strings) or `code`; matched codes insert with `source='sheet'`; unknown labels are not inserted and are returned in a second export `unmappedFacilities(db, labels): Promise<string[]>` so the caller can report them. Rows with `source` other than `sheet` are untouched.
7. AC7: running the statements twice gives identical table contents (idempotent).

## Unit tests to write
- [ ] `creates city and hotel with folded name_search and verbatim fields`: covers AC2, AC3
- [ ] `second run with same input changes nothing`: covers AC7
- [ ] `slug is not changed by a later run or tab rename; id is stable`: covers AC3
- [ ] `new hotel is review by default and published with autoPublish`: covers AC4
- [ ] `existing published and hidden hotels keep their status`: covers AC4
- [ ] `images replaced in order, duplicates dropped`: covers AC5
- [ ] `sheet facilities replaced via synonyms, mytour rows kept, unknown reported`: covers AC6

## Files this task may touch
- `sheet-rag/src/sync/writeHotel.ts`
- `sheet-rag/test/sync/writeHotel.spec.ts`

## Dev notes
The facility_catalog is empty after migrations (no seed exists); tests insert their own catalog rows. Seeding the real catalog is not part of this story (see assumptions in the lead report).

## Review

## Questions
