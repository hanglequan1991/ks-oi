# TC-2: Migrations are safe to run again (no duplicates, no data loss)

- id: TC-2
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC2
- status: done
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
- Automation test: `sheet-rag/e2e/TC-2.e2e.ts` (one test, Node-only, runs under the chromium project; mobile project skips it, as in TC-1).
- Step 2 needs a `facility_catalog` row for `pool` before the `hotel_facilities` link, because of the foreign key. The test inserts it first.
- Expected results 3 to 5 are asserted: row counts and a full row snapshot of every table, settings = 5 rows, and field-by-field checks of the city, hotel, room (1250000), rule and facility link after two re-runs.
- Run: `npx playwright test -c playwright.node.config.ts e2e/TC-2.e2e.ts --trace off --project=chromium` (1 passed).

## Review
<!-- Written by qalead. -->
Verdict: approve

- Ran `npx playwright test -c playwright.node.config.ts e2e/TC-2.e2e.ts --trace off --project=chromium`: 1 passed.
- Steps 1 to 5 are followed in order. Runs 1, 2 and 3 of `applyMigrations` are each asserted to resolve; the inserts are asserted successful.
- Assertions are real: per-table row counts before and after, settings is exactly the 5 expected keys (before and after, equal), city/hotel/room (base_price 1250000)/rule/facility link checked field for field, plus a full `SELECT *` snapshot of every user table compared before and after the re-runs.
- No sleeps, no browser selectors; only its own test file is touched; no Cloudflare token is used.
- Deviation accepted: inserting a `facility_catalog` row (`pool`) before the `hotel_facilities` link is required by the foreign key and does not weaken the test (the extra row is included in the before/after counts and snapshot). The TC step 2 was incomplete, so it is amended below.
- Optional, non-blocking: none.

Step 2 amendment (qalead): insert a `facility_catalog` row `pool` first, then the facility link.

## Questions
<!-- Q: ...   A: ... -->
