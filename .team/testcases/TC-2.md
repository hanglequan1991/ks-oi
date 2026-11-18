# TC-2: Migrations are safe to run again (no duplicates, no data loss)

- id: TC-2
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC2
- status: in-progress
- assignee: qa
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-2.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1 (fake D1, migrations 0001 and 0002 present, Playwright installed, no `CLOUDFLARE_API_TOKEN`).

## Steps
1. Create a fake D1 and run `applyMigrations(db)`.
2. Insert a city, a hotel (with that city), a room with price 1250000, a hotel-level booking rule and a facility link.
3. Record row counts of every table and the full contents of `settings`.
4. Run `applyMigrations(db)` a second time, then a third time.
5. Re-read row counts and `settings` contents and the inserted rows.

## Expected results
1. The first run succeeds.
2. The inserts succeed.
3. Counts are recorded (settings has 5 rows: `service_fee_percent`, `show_fee_note`, `disclaimer_vi`, `disclaimer_en`, `data_version`).
4. The second and third runs resolve without error.
5. Counts of all tables are identical to step 3; `settings` still has exactly one row per key (5 rows); the city, hotel, room (price 1250000), rule and facility link are unchanged field for field.

## Test data
- City `Da Nang`, hotel `Hotel Test`, room `Deluxe` price 1250000, rule text `Huy trước 3 ngày`.

## QA notes
<!-- Written by qa. -->

## Review
<!-- Written by qalead. -->

## Questions
<!-- Q: ...   A: ... -->
