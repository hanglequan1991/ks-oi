# TASK-21: Published hotel detail query (src/db/hotelDetail.ts)

- id: TASK-21
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-2 (schema), TASK-16 (sample data), TASK-18 (row types), TASK-1 (fake D1)
- size: fits a 100k-token context (few files, one behaviour)

## Why
AC4 and AC5: loads everything the detail page needs for one published hotel. Takes `D1Database` as a parameter; imports only `src/domain/` types. Uses `db.batch` (or a few prepared statements, one query per table, never one per room) with bound parameters.

`sheet-rag/src/db/hotelDetail.ts`:
```ts
export interface HotelDetailRows { hotel: HotelRow; rooms: RoomRow[]; rules: RuleRow[]; facilities: FacilityRow[]; images: ImageRow[] }
export async function getPublishedHotelDetail(db: D1Database, slug: string): Promise<HotelDetailRows | null>;
```
Behaviour:
- Look up the hotel by `slug` with `status = 'published'` (joined to `cities` for both names). If it does not exist, or its status is `review` or `hidden`, return `null` and run no further queries.
- Rooms: `ORDER BY position, name`; select the room columns of `RoomRow` including `base_price` (it is converted to a final price by the serializer and never returned to the client).
- Rules: all rows of `booking_rules` for the hotel (`room_id` NULL and room level), `raw_text` and `synced_at` untouched, ordered by `synced_at DESC, id`.
- Facilities: join `facility_catalog` for `code, label_vi, label_en`, with `confirmed`; order by `code`.
- Images: `ORDER BY position, url`.
- Hotel-level facts: `slug, name, city, stars, address, area, lat, lng, description_vi, description_en, synced_at`.

## Acceptance criteria
1. AC4: for `mong-hotel` the result has 2 rooms in position order (`Deluxe`, `Standard`), 2 images in order, facilities `parking` (confirmed 0) and `pool` (confirmed 1) with Vietnamese and English labels, the hotel-level rule and the room-level rule (one with `room_id` NULL, one with the Deluxe room id).
2. AC4: the rule `raw_text` equals the seeded text byte for byte (newline, leading and trailing spaces, diacritics) and each rule keeps its `synced_at`.
3. AC6 / AC8: `Deluxe` has `base_price` 1250000 and `Standard` has `null` (not 0).
4. AC5: `mong-review` (review), `mong-hidden` (hidden) and an unknown slug (`khong-co`) each return `null`.
5. AC4: a published hotel with no rooms, images or rules (`dong-do-hotel`) returns empty arrays (not null) for those and its facilities.
6. AC13 (safe input): a slug such as `x' OR '1'='1` returns `null` and does not throw.

## Unit tests to write
In `test/db/hotelDetail.spec.ts`, fake D1 + `applyMigrations` + `seedApiSample`.
- [ ] `loads rooms, images, facilities and both rule levels for a published hotel`: covers AC1
- [ ] `keeps rule text and sync dates exactly as stored`: covers AC2
- [ ] `returns the base price of priced rooms and null for unpriced rooms`: covers AC3
- [ ] `returns null for review, hidden and unknown hotels`: covers AC4
- [ ] `returns empty lists for a hotel with no rooms or rules`: covers AC5
- [ ] `a hostile slug returns null without error`: covers AC6

## Files this task may touch
- `sheet-rag/src/db/hotelDetail.ts` (new)
- `sheet-rag/test/db/hotelDetail.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
