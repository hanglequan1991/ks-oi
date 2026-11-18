# TC-1: Migrations create all tables on an empty database

- id: TC-1
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC1
- status: todo
- assignee: qa
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
- Test written at `sheet-rag/e2e/TC-1.e2e.ts` (steps 1-6, all expected results asserted). It cannot run yet, for two environment reasons below.
- Blocker 1 (config): `playwright.config.ts` webServer runs `npm run build:client && npx wrangler dev --local --port 8787` before any test. In this sandbox workerd fails to start (`No such module "cloudflare-internal:ai-api"`), so `npx playwright test e2e/TC-1.e2e.ts --trace off` exits with `Process from config.webServer was not able to start. Exit code: 1`. A Node-only test cannot run until the webServer is skipped for it (config change, not made by qa).
- Blocker 2 (import): `test/fakes/migrations.ts` uses `import.meta.url`. Playwright loads the spec as CJS (no `"type": "module"` in `sheet-rag/package.json`), so the import fails with `SyntaxError: Cannot use 'import.meta' outside a module`. Fix options for lead/owner: add `"type": "module"` to package.json or Playwright ESM support, or make `migrations.ts` avoid `import.meta` (e.g. `__dirname`-free path default via a parameter).
- Diagnostic run with `E2E_BASE_URL` set (skips the webServer) still fails on blocker 2, so the assertions were not exercised.

## Review
<!-- Written by qalead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
- Q (lead, technical): The Playwright webServer in `sheet-rag/playwright.config.ts` blocks Node-only tests here (wrangler dev cannot start in this sandbox), and `test/fakes/migrations.ts` uses `import.meta.url`, which the CJS Playwright loader rejects. Should the config skip the webServer for Node-only specs, and should the fakes be made loadable from Playwright (e.g. set `"type": "module"`)? qa did not edit config or product code.
- A (lead, technical): Yes to both, without `"type": "module"`. Created [TASK-40](../tasks/TASK-40.md): a second config `playwright.node.config.ts` (no webServer, ignores live TCs 10/23/24/39/62; run with `npm run e2e:node`) while `playwright.config.ts` stays for live runs, and `test/fakes/migrations.ts` now derives its default folder from `process.cwd()` instead of `import.meta.url`. `e2e/TC-1.e2e.ts` needs no change (it already uses `__dirname`). qa should re-run TC-1 with `npx playwright test -c playwright.node.config.ts e2e/TC-1.e2e.ts` once TASK-40 is `done`.
