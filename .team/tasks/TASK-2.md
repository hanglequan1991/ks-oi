# TASK-2: Schema migration 0001_init.sql

- id: TASK-2
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-1
- size: fits a 100k-token context (few files, one behaviour)

## Why
Creates the D1 tables of technical-design.html section 5 that this story needs. New file only; `src/index.ts` is not touched. Run `npm test -- --run test/migrations/0001_init.spec.ts` (works because of TASK-1).

Scope decisions by lead:
- Include: `cities`, `hotels` (with indexes), `facility_catalog`, `hotel_facilities`, `hotel_images`, `rooms` (with index), `booking_rules` (with index), `settings`, `overrides`. Copy the column definitions from section 5 exactly.
- Do NOT include `hotels_fts` (FTS5 support on D1 is marked unverified; it belongs to the sync story) and none of the crawl, sync_runs or admin tables (Version 2 / STORY-14).
- Every statement must be re-runnable: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. No seed data in this file (TASK-3 does that).
- Tighten one design detail for AC8: `rooms.base_price` must have `CHECK (base_price IS NULL OR (typeof(base_price) = 'integer' AND base_price >= 0))`, because a plain INTEGER column silently accepts 1000.5 as a real number.
- Later migrations (crawl, admin) are numbered after `0002_seed_settings.sql`, so they become `0003_...`; this is a numbering change from the design document only.

## Acceptance criteria
1. AC1: Given an empty database, when `0001_init.sql` runs, then it finishes with no errors and the tables `cities`, `hotels`, `rooms`, `facility_catalog`, `hotel_facilities`, `hotel_images`, `booking_rules`, `settings`, `overrides` exist.
2. AC2: Given the migration was already applied, when it runs again, then it succeeds and rows inserted in between (a city, a hotel, a room) are still there, unchanged and not duplicated.
3. AC6: Given a hotel is inserted, then status may be `review`, `published` or `hidden` (default `review` when omitted) and any other value (for example `live`, empty string) is rejected by the database.
4. AC7: Given a booking rule is inserted, then it is accepted with `room_id` NULL (hotel level) and with a valid `room_id` (room level); it keeps `raw_text` exactly as inserted (leading/trailing spaces, newlines, Vietnamese diacritics) and `synced_at`; a rule without `raw_text` or `synced_at` is rejected; a `room_id` that does not exist is rejected.
5. AC8: Given a room is inserted, then `base_price` accepts a whole number (e.g. 1250000) and NULL (no price); it rejects 1250000.5, a text value such as `'abc'`, and a negative number.
6. AC9: Given a hotel with rooms, facilities, images, a hotel-level rule and a room-level rule, when the hotel row is deleted (foreign keys on), then its rooms, hotel_facilities, hotel_images and booking_rules rows are all gone, while other hotels' rows and the `cities` and `facility_catalog` rows remain. Deleting a room alone removes its room-level rules but not the hotel-level rule.

## Unit tests to write
All in `test/migrations/0001_init.spec.ts`, using `createFakeD1()` and `applyMigrations()` from TASK-1 (give the migration file path explicitly or use a helper that applies only `0001_init.sql`; this test must not depend on `0002`).
- [ ] `creates all required tables on an empty database`: covers AC1
- [ ] `can be applied twice without error and keeps data`: covers AC2
- [ ] `hotel status accepts review, published, hidden and defaults to review`: covers AC6
- [ ] `hotel status rejects any other value`: covers AC6
- [ ] `booking rule at hotel level and room level, raw text kept verbatim with synced_at`: covers AC7
- [ ] `booking rule requires raw_text and synced_at and a real room`: covers AC7
- [ ] `room price accepts whole VND and NULL`: covers AC8
- [ ] `room price rejects fractions, text and negatives`: covers AC8
- [ ] `deleting a hotel removes rooms, facilities, images and rules`: covers AC9
- [ ] `deleting a room removes only its room-level rules`: covers AC9

## Files this task may touch
- `sheet-rag/migrations/0001_init.sql` (new)
- `sheet-rag/test/migrations/0001_init.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Added `migrations/0001_init.sql` with the 9 tables from section 5 (no hotels_fts, no crawl/sync/admin tables), all `IF NOT EXISTS`, no seed data.
- `rooms.base_price` has the tightened CHECK from the task (`typeof = 'integer'` and `>= 0`, NULL allowed).
- Test file reads only `migrations/0001_init.sql` (not the folder), so it does not depend on 0002.
- Red confirmed (missing SQL file), then green: 10/10 in `0001_init.spec.ts`; full unit suite 31/31.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
