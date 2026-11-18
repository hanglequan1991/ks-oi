# TC-1: Migrations create all tables on an empty database

- id: TC-1
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC1
- status: todo
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-1.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1 on `node:sqlite`)

## Preconditions
- TASK-1 (fake D1 and `applyMigrations`), TASK-2 and TASK-3 are done; `sheet-rag/migrations/0001_init.sql` and `0002_seed_settings.sql` exist.
- Playwright is installed (TASK-1 or a later task adds it); the test runs as a plain Node test (no browser page needed) using `test.describe` and `expect` only.
- `CLOUDFLARE_API_TOKEN` is unset (the test deletes it at the start).
- Node 22 or newer (needed by `node:sqlite`).

## Steps
1. Create an empty database with `createFakeD1()` from `sheet-rag/test/fakes/d1.ts`.
2. Query `sqlite_master` and confirm no user tables exist yet.
3. Run `applyMigrations(db)` (all files in `sheet-rag/migrations/`, in name order).
4. Query `sqlite_master` for tables.
5. Negative: use `createFakeD1()` again and run only `0002_seed_settings.sql` without `0001`.

## Expected results
1. The database is created without error.
2. The list of user tables is empty.
3. `applyMigrations` resolves with no error.
4. The tables `cities`, `hotels`, `rooms`, `facility_catalog`, `hotel_facilities`, `hotel_images`, `booking_rules`, `settings` and `overrides` all exist (facilities and images are covered by `facility_catalog`/`hotel_facilities` and `hotel_images`).
5. Running the seed alone rejects (the `settings` table does not exist), which proves the seed does not create the schema silently.
6. The migration creates no Mytour crawl, sync_runs or admin tables (out of scope): the table list contains no name starting with `crawl_`, `admin_` or `sync_`.

## Test data
- Required table names: cities, hotels, rooms, facility_catalog, hotel_facilities, hotel_images, booking_rules, settings, overrides.

## QA notes
<!-- Written by qa: anything the reviewer should know, product bugs found. -->

## Review
<!-- Written by qalead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
