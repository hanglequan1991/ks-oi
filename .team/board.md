# Board

Owned by `pm`. One table per story. Statuses: todo, in-progress, review, rework, done, blocked.

Table format (copy for each story; test cases go in the same table with Type `qa`). All paths are under `sheet-rag/`. Dependencies are copied from the task files.

## STORY-13: Database foundation (schema, settings, pricing, test tooling)

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-1](tasks/TASK-1.md) | backend | vitest.unit.config.mts, package.json (test script only), test/fakes/d1.ts, test/fakes/migrations.ts, test/fakes/d1.spec.ts, test/fakes/migrations.spec.ts | dev | done | 0 | deps: none; lead approved |
| [TASK-2](tasks/TASK-2.md) | backend | migrations/0001_init.sql, test/migrations/0001_init.spec.ts | dev | done | 0 | deps: TASK-1 |
| [TASK-3](tasks/TASK-3.md) | backend | migrations/0002_seed_settings.sql, test/migrations/0002_seed_settings.spec.ts | dev | done | 0 | deps: TASK-2; coordinator verified full suite 49 tests pass |
| [TASK-4](tasks/TASK-4.md) | backend | src/domain/pricing.ts, test/domain/pricing.spec.ts | dev | done | 0 | deps: TASK-1 |
| [TASK-5](tasks/TASK-5.md) | backend | src/db/settings.ts, test/db/settings.spec.ts | dev | done | 0 | deps: TASK-3, TASK-4, TASK-1; lead approved |

QA test cases for STORY-13 (TC-10 needs a live Cloudflare D1 deployment and cannot run locally).

Run note (all stories): e2e TCs run via `npx playwright test -c playwright.node.config.ts e2e/TC-<n>.e2e.ts` inside sheet-rag/. Live TCs 10, 23, 24, 39, 62 use the main config (playwright.config.ts).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-1](testcases/TC-1.md) | qa | e2e/TC-1.e2e.ts | qa | done | 0 | qalead approved; TASK-40 done |
| [TC-2](testcases/TC-2.md) | qa | e2e/TC-2.e2e.ts | qa | done | 0 | qalead approved |
| [TC-3](testcases/TC-3.md) | qa | e2e/TC-3.e2e.ts | qa | done | 0 | qalead approved |
| [TC-4](testcases/TC-4.md) | qa | e2e/TC-4.e2e.ts | qa | done | 0 | qalead approved |
| [TC-5](testcases/TC-5.md) | qa | e2e/TC-5.e2e.ts | qa | done | 0 | qalead approved |
| [TC-6](testcases/TC-6.md) | qa | e2e/TC-6.e2e.ts | qa | done | 0 | qalead approved |
| [TC-7](testcases/TC-7.md) | qa | e2e/TC-7.e2e.ts | qa | done | 0 | qalead approved |
| [TC-8](testcases/TC-8.md) | qa | e2e/TC-8.e2e.ts | qa | done | 0 | qalead approved |
| [TC-9](testcases/TC-9.md) | qa | e2e/TC-9.e2e.ts | qa | done | 0 | qalead approved |
| [TC-10](testcases/TC-10.md) | qa | e2e/TC-10.e2e.ts | - | blocked | 0 | needs live Cloudflare D1; owner runs |

Follow-up candidate (lead): booking_rules does not enforce that room_id belongs to the same hotel_id (composite FK or trigger + a new TC); raised by qa/qalead in TC-6; low-medium priority.

## STORY-16: Web shell (app, layout, i18n, middleware)

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-6](tasks/TASK-6.md) | backend | package.json (add hono only), package-lock.json, vitest.unit.config.mts, tsconfig.json, test/web/smoke.spec.tsx | dev | done | 0 | deps: TASK-1 |
| [TASK-7](tasks/TASK-7.md) | backend | src/web/i18n/vi.ts, src/web/i18n/en.ts, src/web/i18n/t.ts, test/web/i18n-keys.spec.ts, test/web/i18n/t.spec.ts | dev | done | 0 | deps: TASK-6; common.siteName = "Sheet RAG" provisional (owner to confirm) |
| [TASK-8](tasks/TASK-8.md) | frontend | src/web/pages/components/Disclaimer.tsx, FeeNote.tsx, PriceBlock.tsx, test/web/pages/components.spec.tsx | dev | done | 0 | deps: TASK-7, TASK-5, TASK-6; lead approved |
| [TASK-9](tasks/TASK-9.md) | frontend | src/web/pages/Layout.tsx, src/web/render.ts, public/app.css, test/web/pages/layout.spec.tsx | dev | done | 0 | deps: TASK-8, TASK-7, TASK-6; lead approved |
| [TASK-10](tasks/TASK-10.md) | frontend | public/lang.js, test/client/lang.spec.ts | dev | done | 0 | deps: TASK-6 |
| [TASK-11](tasks/TASK-11.md) | backend | src/web/middleware/security.ts, test/web/middleware/security.spec.ts | dev | done | 0 | deps: TASK-6; lead approved |
| [TASK-12](tasks/TASK-12.md) | backend | src/web/middleware/rateLimit.ts, test/web/middleware/rateLimit.spec.ts | dev | done | 0 | deps: TASK-6; lead approved |
| [TASK-13](tasks/TASK-13.md) | backend | src/web/middleware/inputLimit.ts, test/web/middleware/inputLimit.spec.ts | dev | done | 0 | deps: TASK-6; lead approved |
| [TASK-14](tasks/TASK-14.md) | backend | src/web/app.ts, test/web/app.spec.tsx | dev | done | 0 | deps: TASK-5, TASK-7, TASK-9, TASK-11, TASK-12, TASK-13; lead approved; guards only /search, /chat, /api/suggest, /api/hotels/*; mount must register each page at both /x and /en/x |
| [TASK-15](tasks/TASK-15.md) | backend | src/index.ts, src/env.ts (new if needed), wrangler.jsonc, test/index.web.spec.ts (provisional list) | - | blocked | 0 | deferred; not needed for the separate worker (see TASK-42). Waiting for the owner's real sheet-rag source (src/index.ts, src/rag/); deps: TASK-14, TASK-10, TASK-9; TASK-13's body-size check only runs when bodyFields is non-empty; wiring must always pass bodyFields on POST routes; wiring must also guard /en/search and /en/chat with the same rate limit and input caps as /search and /chat (TASK-14 only guards the vi paths); mount must register each page at both /x and /en/x |
| [TASK-40](tasks/TASK-40.md) | backend | playwright.node.config.ts (new), package.json (e2e:node script only), test/fakes/migrations.ts, test/fakes/migrations.spec.ts (one test), test/client/playwright-node-config.spec.ts (new) | dev | done | 0 | lead approved; deps: TASK-39, TASK-1 (both done); PREREQUISITE FOR ALL e2e TCs (now satisfied); sole package.json editor now; task file lists story as STORY-13, placed here per coordinator |
| [TASK-41](tasks/TASK-41.md) | backend | playwright.node.config.ts, test/client/playwright-node-config.spec.ts | dev | done | 0 | lead approved; deps: TASK-40 (done); browser-path selection (PW_CHROMIUM_PATH, then installed Chromium/headless shell, only when Playwright's default is absent) in the node config; prerequisite for all browser TCs |
| [TASK-42](tasks/TASK-42.md) | backend | src/site.ts (new), wrangler.hotel.jsonc (new), package.json (scripts deploy:hotel and dry-run:hotel only), DEPLOY-hotel-dictionary.md (new), test/web/site.spec.tsx (new), test/web/site-config.spec.ts (new) | dev | done | 0 | lead approved; deploy Version 1 as separate Worker hotel-dictionary with own D1 (user decision 2026-11-19); deps: TASK-14, TASK-25, TASK-38, TASK-36, TASK-34 (all done); did not touch wrangler.jsonc or src/index.ts |

Sequencing note: after TASK-41 is done, all browser TCs (TC-12 onwards) can run. Order: STORY-16 TC-12..22 first, then STORY-15 TC-25..38, then STORY-11 TC-40 (harness) then TC-41..61. Live TCs 23, 24, 39, 62 are blocked for the owner.

QA test cases for STORY-16 (TC-11 to TC-22 need Playwright from TASK-39 and, for real runs, TASK-15; TC-23 and TC-24 need a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-11](testcases/TC-11.md) | qa | e2e/TC-11.e2e.ts | qa | done | 0 | qalead approved; inline executablePath workaround is temporary (see TASK-41) |
| [TC-12](testcases/TC-12.md) | qa | e2e/TC-12.e2e.ts | qa | done | 0 | qalead approved |
| [TC-13](testcases/TC-13.md) | qa | e2e/TC-13.e2e.ts | qa | done | 0 | qalead approved |
| [TC-14](testcases/TC-14.md) | qa | e2e/TC-14.e2e.ts | qa | done | 0 | qalead approved |
| [TC-15](testcases/TC-15.md) | qa | e2e/TC-15.e2e.ts | qa | done | 0 | qalead approved |
| [TC-16](testcases/TC-16.md) | qa | e2e/TC-16.e2e.ts | qa | done | 0 | qalead approved |
| [TC-17](testcases/TC-17.md) | qa | e2e/TC-17.e2e.ts | qa | done | 0 | qalead approved |
| [TC-18](testcases/TC-18.md) | qa | e2e/TC-18.e2e.ts | qa | blocked | 0 | not reworked in Version 1 (minimal testing); test passes via the X-Forwarded-For fallback; fix when next touched (send CF-Connecting-IP in the 429 step) |
| [TC-19](testcases/TC-19.md) | qa | e2e/TC-19.e2e.ts | - | deferred | 0 | no automation file (half-written one deleted); not automated in Version 1 (minimal testing) |
| [TC-20](testcases/TC-20.md) | qa | e2e/TC-20.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-21](testcases/TC-21.md) | qa | e2e/TC-21.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-22](testcases/TC-22.md) | qa | e2e/TC-22.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-23](testcases/TC-23.md) | qa | e2e/TC-23.e2e.ts | - | blocked | 0 | needs live deployment; owner |
| [TC-24](testcases/TC-24.md) | qa | e2e/TC-24.e2e.ts | - | blocked | 0 | needs live deployment; owner |

## STORY-15: Hotel public API

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-16](tasks/TASK-16.md) | backend | test/fixtures/apiSample.ts, test/fixtures/apiSample.spec.ts | dev | done | 0 | deps: TASK-2, TASK-3, TASK-1; lead approved |
| [TASK-17](tasks/TASK-17.md) | backend | src/domain/fold.ts, test/domain/fold.spec.ts | dev | done | 0 | deps: TASK-1 |
| [TASK-18](tasks/TASK-18.md) | backend | src/domain/hotelView.ts, test/domain/hotelView.spec.ts | dev | done | 0 | deps: TASK-4, TASK-1; lead approved |
| [TASK-19](tasks/TASK-19.md) | backend | src/web/api/params.ts, src/web/api/types.ts, test/web/api/params.spec.ts | dev | done | 0 | deps: TASK-5, TASK-1; lead approved |
| [TASK-20](tasks/TASK-20.md) | backend | src/db/hotelList.ts, test/db/hotelList.spec.ts | dev | done | 0 | deps: TASK-2, TASK-16, TASK-17, TASK-18, TASK-1; lead approved |
| [TASK-21](tasks/TASK-21.md) | backend | src/db/hotelDetail.ts, test/db/hotelDetail.spec.ts | dev | done | 0 | deps: TASK-2, TASK-16, TASK-18, TASK-1; lead approved |
| [TASK-22](tasks/TASK-22.md) | backend | src/db/cities.ts, src/db/suggest.ts, test/db/cities.spec.ts, test/db/suggest.spec.ts | dev | done | 0 | deps: TASK-2, TASK-16, TASK-17, TASK-1; lead approved; cities sorted in JS by folded name |
| [TASK-23](tasks/TASK-23.md) | backend | src/web/api/hotels.ts, test/web/api/hotels.spec.ts | dev | done | 0 | deps: TASK-14, TASK-5, TASK-16, TASK-18, TASK-19, TASK-20, TASK-21; lead approved |
| [TASK-24](tasks/TASK-24.md) | backend | src/web/api/meta.ts, test/web/api/meta.spec.ts | dev | done | 0 | deps: TASK-14, TASK-5, TASK-16, TASK-18, TASK-19, TASK-22; lead approved |
| [TASK-25](tasks/TASK-25.md) | backend | src/web/api/index.ts, test/web/api/api.integration.spec.ts | dev | done | 0 | deps: TASK-23, TASK-24, TASK-3, TASK-14; lead approved |

QA test cases for STORY-15 (TC-39 needs a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-25](testcases/TC-25.md) | qa | e2e/TC-25.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-26](testcases/TC-26.md) | qa | e2e/TC-26.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-27](testcases/TC-27.md) | qa | e2e/TC-27.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-28](testcases/TC-28.md) | qa | e2e/TC-28.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-29](testcases/TC-29.md) | qa | e2e/TC-29.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-30](testcases/TC-30.md) | qa | e2e/TC-30.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-31](testcases/TC-31.md) | qa | e2e/TC-31.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-32](testcases/TC-32.md) | qa | e2e/TC-32.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-33](testcases/TC-33.md) | qa | e2e/TC-33.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-34](testcases/TC-34.md) | qa | e2e/TC-34.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-35](testcases/TC-35.md) | qa | e2e/TC-35.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-36](testcases/TC-36.md) | qa | e2e/TC-36.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-37](testcases/TC-37.md) | qa | e2e/TC-37.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-38](testcases/TC-38.md) | qa | e2e/TC-38.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-39](testcases/TC-39.md) | qa | e2e/TC-39.e2e.ts | - | blocked | 0 | needs live deployment; owner |

## STORY-11: Billing page (/bill, /en/bill)

Sequencing note: package.json and package-lock.json are edited by TASK-1, TASK-6, TASK-34 and TASK-39, so these four must run sequentially in that order, never in parallel. TASK-27 is the only STORY-11 task editing vi.ts/en.ts (do not run in parallel with other tasks that edit them).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-26](tasks/TASK-26.md) | backend | src/domain/money.ts, test/domain/money.spec.ts | dev | done | 0 | deps: TASK-1 (test runner only) |
| [TASK-27](tasks/TASK-27.md) | frontend | src/web/i18n/vi.ts, src/web/i18n/en.ts, test/web/i18n/bill-keys.spec.ts | dev | done | 0 | lead approved; deps: TASK-7; sole STORY-11 editor of vi.ts/en.ts |
| [TASK-28](tasks/TASK-28.md) | frontend | src/client/bill/state.ts, test/client/bill-state.spec.ts | dev | done | 0 | lead approved; deps: TASK-26, TASK-6 |
| [TASK-29](tasks/TASK-29.md) | frontend | src/client/bill/storage.ts, test/client/bill-storage.spec.ts | dev | done | 0 | deps: TASK-28, TASK-26; lead approved |
| [TASK-30](tasks/TASK-30.md) | frontend | src/client/bill/combobox.ts, test/client/bill-combobox.spec.ts | dev | done | 0 | deps: TASK-17, TASK-6; lead approved |
| [TASK-31](tasks/TASK-31.md) | frontend | src/client/bill/format.ts, test/client/bill-format.spec.ts | dev | done | 0 | deps: TASK-26, TASK-6; lead approved |
| [TASK-32](tasks/TASK-32.md) | frontend | src/client/bill/api.ts, test/client/bill-api.spec.ts | dev | done | 0 | lead approved; deps: TASK-28, TASK-6; server contract TASK-23/TASK-24 (tested with fake fetch) |
| [TASK-33](tasks/TASK-33.md) | frontend | public/bill.css, test/client/bill-css.spec.ts | dev | done | 0 | lead approved; deps: TASK-6; does not touch public/app.css (TASK-9) |
| [TASK-34](tasks/TASK-34.md) | backend | scripts/build-client.mjs, package.json (three scripts + esbuild devDependency), package-lock.json, .gitignore, test/client/build.spec.ts | dev | done | 0 | lead approved; deps: TASK-6, TASK-1, TASK-26 (money.ts parseVnd; lead answer); must wait until TASK-26 is done; package.json/package-lock.json sequence: TASK-1, 6, 34, 39 (sequential) |
| [TASK-35](tasks/TASK-35.md) | frontend | src/client/bill/viewModel.ts, src/client/bill/render.ts, test/client/bill-viewmodel.spec.ts | dev | done | 0 | deps: TASK-28, TASK-31, TASK-26, TASK-33 (read-only class contract); lead approved |
| [TASK-36](tasks/TASK-36.md) | frontend | src/client/bill/config.ts, src/client/bill/main.ts, test/client/bill-config.spec.ts, test/client/bill-guard.spec.ts | dev | done | 0 | lead approved; deps: TASK-28, TASK-29, TASK-30, TASK-31, TASK-32, TASK-35, TASK-34, TASK-26 |
| [TASK-37](tasks/TASK-37.md) | frontend | src/web/pages/Bill.tsx, test/web/pages/bill-page.spec.tsx | dev | done | 0 | lead approved; deps: TASK-9, TASK-8, TASK-27, TASK-7, TASK-5, TASK-33, TASK-6, TASK-26 |
| [TASK-38](tasks/TASK-38.md) | backend | src/web/routes/bill.ts, test/web/routes/bill.spec.tsx | dev | done | 0 | lead approved; deps: TASK-37, TASK-14, TASK-9, TASK-5 (registered via mount hook; app.ts not edited) |
| [TASK-39](tasks/TASK-39.md) | backend | package.json (@playwright/test devDependency + e2e script), package-lock.json, playwright.config.ts, test/client/playwright-config.spec.ts | dev | done | 0 | lead approved; deps: TASK-34, TASK-6; last in package.json sequence (TASK-1, 6, 34, 39); real e2e runs also need TASK-15 (blocked on owner) |
| [TASK-43](tasks/TASK-43.md) | frontend | public/bill.css, test/client/bill-css.spec.ts | dev | done | 1 | lead approved after one rework (see task file); deps: TASK-33, TASK-35, TASK-36, TASK-37 (all done); restyle to approved design; system font stack (no Inter, CSP); do not deploy between TASK-43 and TASK-44 |
| [TASK-44](tasks/TASK-44.md) | frontend | src/web/pages/Bill.tsx, src/web/pages/Layout.tsx, src/client/bill/render.ts, src/client/bill/viewModel.ts, src/client/bill/config.ts, src/web/i18n/vi.ts, src/web/i18n/en.ts, test/web/pages/bill-page.spec.tsx, test/web/pages/layout.spec.tsx, test/client/bill-viewmodel.spec.ts, test/client/bill-config.spec.ts, test/web/i18n/bill-keys.spec.ts | dev | done | 0 | lead approved (see task file); deps: TASK-43 (done) (must run strictly after it, never in parallel), TASK-35, TASK-36, TASK-37 (done); edits vi.ts/en.ts (no other task may run alongside) |

QA test cases for STORY-11 (TC-40 owns the shared harness e2e/support/billServer.ts and must be done first; TC-62 needs a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-40](testcases/TC-40.md) | qa | e2e/TC-40.e2e.ts, e2e/support/billServer.ts | - | deferred | 0 | not automated in Version 1 (minimal testing); owns shared harness e2e/support/billServer.ts |
| [TC-41](testcases/TC-41.md) | qa | e2e/TC-41.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-42](testcases/TC-42.md) | qa | e2e/TC-42.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-43](testcases/TC-43.md) | qa | e2e/TC-43.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-44](testcases/TC-44.md) | qa | e2e/TC-44.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-45](testcases/TC-45.md) | qa | e2e/TC-45.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-46](testcases/TC-46.md) | qa | e2e/TC-46.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-47](testcases/TC-47.md) | qa | e2e/TC-47.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-48](testcases/TC-48.md) | qa | e2e/TC-48.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-49](testcases/TC-49.md) | qa | e2e/TC-49.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-50](testcases/TC-50.md) | qa | e2e/TC-50.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-51](testcases/TC-51.md) | qa | e2e/TC-51.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-52](testcases/TC-52.md) | qa | e2e/TC-52.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-53](testcases/TC-53.md) | qa | e2e/TC-53.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-54](testcases/TC-54.md) | qa | e2e/TC-54.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-55](testcases/TC-55.md) | qa | e2e/TC-55.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-56](testcases/TC-56.md) | qa | e2e/TC-56.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-57](testcases/TC-57.md) | qa | e2e/TC-57.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-58](testcases/TC-58.md) | qa | e2e/TC-58.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-59](testcases/TC-59.md) | qa | e2e/TC-59.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-60](testcases/TC-60.md) | qa | e2e/TC-60.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-61](testcases/TC-61.md) | qa | e2e/TC-61.e2e.ts | - | deferred | 0 | not automated in Version 1 (minimal testing) |
| [TC-62](testcases/TC-62.md) | qa | e2e/TC-62.e2e.ts | - | blocked | 0 | needs live deployment; owner |

## STORY-14: Sheet-to-D1 sync (public Google pages, hourly cron)

File ownership note: src/site.ts, test/web/site.spec.tsx, test/web/site-config.spec.ts, wrangler.hotel.jsonc and DEPLOY-hotel-dictionary.md are touched only by TASK-56; package.json is touched by none of these tasks.

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-45](tasks/TASK-45.md) | backend | migrations/0003_sync.sql, test/migrations/0003_sync.spec.ts | dev | done | 0 | deps: none; lead approved |
| [TASK-46](tasks/TASK-46.md) | backend | src/sync/sheetSource.ts, src/sync/publicGoogleSource.ts, test/fakes/sheetSource.ts, test/sync/publicGoogleSource.spec.ts, test/fakes/sheetSource.spec.ts, test/fixtures/google/* | dev | done | 0 | deps: TASK-59; lead approved; format unverified against real Google pages (owner to verify on first run) |
| [TASK-47](tasks/TASK-47.md) | backend | src/sync/csv.ts, src/sync/hash.ts, test/sync/csv.spec.ts, test/sync/hash.spec.ts | dev | done | 0 | deps: TASK-59; lead approved |
| [TASK-48](tasks/TASK-48.md) | backend | src/sync/record.ts, src/sync/validate.ts, test/sync/validate.spec.ts | dev | done | 0 | deps: TASK-59; lead approved |
| [TASK-59](tasks/TASK-59.md) | backend | vitest.unit.config.mts, test/client/vitest-config.spec.ts | dev | done | 0 | deps: none; lead approved; only task editing vitest.unit.config.mts |
| [TASK-60](tasks/TASK-60.md) | backend | test/db/apiSample.spec.ts, e2e/TC-1.e2e.ts, e2e/TC-2.e2e.ts, e2e/TC-3.e2e.ts, e2e/TC-4.e2e.ts | dev | done | 1 | deps: TASK-45 (done); rework: see task file (only TC-4.e2e.ts to touch) |
| [TASK-49](tasks/TASK-49.md) | backend | src/db/syncState.ts, src/sync/planSync.ts, test/db/syncState.spec.ts, test/sync/planSync.spec.ts | dev | done | 0 | deps: TASK-59, TASK-45, TASK-46, TASK-47 |
| [TASK-50](tasks/TASK-50.md) | backend | src/sync/writeHotel.ts, test/sync/writeHotel.spec.ts | dev | done | 0 | deps: TASK-59, TASK-45, TASK-48, TASK-47 |
| [TASK-51](tasks/TASK-51.md) | backend | src/sync/writeRooms.ts, test/sync/writeRooms.spec.ts | dev | done | 0 | deps: TASK-59, TASK-48, TASK-47 |
| [TASK-52](tasks/TASK-52.md) | backend | src/sync/overrides.ts, test/sync/overrides.spec.ts | dev | done | 0 | deps: none; lead approved |
| [TASK-53](tasks/TASK-53.md) | backend | src/sync/syncHotel.ts, test/sync/syncHotel.spec.ts | dev | done | 1 | lead approved after one rework (see task file); deps: TASK-48, TASK-49, TASK-50, TASK-51, TASK-52; must call recordTabSuccess after a successful apply (it clears missing_since) because markTabSeen does not; TASK-53 AC6 must itself clear hidden_by_sync and prior_status when restoring a hotel whose tab returned (no helper does it) |
| [TASK-54](tasks/TASK-54.md) | backend | src/db/syncRuns.ts, src/sync/runSync.ts, test/db/syncRuns.spec.ts, test/sync/runSync.spec.ts | dev | done | 1 | lead approved after one rework (see task file); deps: TASK-46, TASK-49, TASK-53 (all done); AC9: runSync returns only counts and failure codes; must call recordTabSuccess after a successful apply (it clears missing_since) because markTabSeen does not; TASK-53 AC6 must itself clear hidden_by_sync and prior_status when restoring a hotel whose tab returned (no helper does it) |
| [TASK-55](tasks/TASK-55.md) | backend | src/web/routes/internalSync.ts, test/web/routes/internalSync.spec.ts | dev | done | 1 | lead approved after one rework; deps: none (sync injected as a function) |
| [TASK-56](tasks/TASK-56.md) | backend | src/site.ts, src/sync/rowParser.ts (stub only), wrangler.hotel.jsonc, DEPLOY-hotel-dictionary.md, test/web/site.spec.tsx, test/web/site-config.spec.ts, test/web/siteSync.spec.tsx | dev | done | 1 | lead approved after one rework (see task file incl. re-review); deps: TASK-46, TASK-54, TASK-55; sole editor of the shared site/wrangler/deploy-doc files; hourly cron (owner may change) |
| [TASK-57](tasks/TASK-57.md) | backend | src/sync/extract.ts, test/fakes/extractor.ts, test/sync/extract.spec.ts | dev | done | 0 | deps: TASK-48; lead approved; EXTRACTOR_MODEL '@cf/meta/llama-3.1-8b-instruct' chosen by dev, unverified on Workers AI: owner or lead must verify before deploy |
| [TASK-61](tasks/TASK-61.md) | backend | src/sync/extract.ts, test/sync/extract.spec.ts | dev | done | 1 | lead approved after one rework (see task file); deps: TASK-57 (done); replaces deprecated extractor model, uses JSON mode |
| [TASK-62](tasks/TASK-62.md) | backend | src/sync/publicGoogleSource.ts, src/sync/sheetSource.ts (only if an option type must change), test/sync/publicGoogleSource.spec.ts, test/fixtures/google/htmlview.html, test/fixtures/google/htmlview-empty.html, optional legacy-shape fixture under test/fixtures/google/ | dev | done | 0 | deps: TASK-46 (done); fixes tab_list_parse_empty found by first live sync (real htmlview shape has pageUrl) and adds fetch retry |
| [TASK-58](tasks/TASK-58.md) | backend | src/sync/rowParser.ts, test/sync/rowParser.spec.ts, test/fixtures/sync/*.csv | - | blocked | 0 | PARSER_VERSION constant currently local to src/sync/runSync.ts; TASK-58 must own or move it; the AI extractor (src/sync/extract.ts, pickExtractor) is to be used inside the parser, not by runSync. blocked: waiting for the owner's DRIVE_FOLDER_ID and ~20 sample rows (two tabs, two cities); deps: TASK-47, TASK-48, TASK-56 (replaces its stub), TASK-57; also shares src/sync/rowParser.ts with TASK-56 (must run after it) |
| [TASK-63](tasks/TASK-63.md) | backend | src/sync/fetchErrors.ts (new), src/sync/sheetSource.ts, src/sync/publicGoogleSource.ts, test/sync/fetchErrors.spec.ts (new), test/sync/publicGoogleSource.spec.ts, test/fakes/sheetSource.ts and its spec (only if needed) | dev | done | 0 | lead approved; deps: TASK-54, TASK-56, TASK-62 (done); first in the publicGoogleSource.ts chain 63, 64, 67 |
| [TASK-64](tasks/TASK-64.md) | backend | src/sync/publicGoogleSource.ts, test/sync/publicGoogleSource.spec.ts, test/sync/skipTabsDoc.spec.ts (new), DEPLOY-hotel-dictionary.md | dev | done | 0 | lead approved; deps: TASK-63 (done), TASK-46; second in the publicGoogleSource.ts chain; edits DEPLOY-hotel-dictionary.md before TASK-71 |
| [TASK-65](tasks/TASK-65.md) | backend | src/sync/budget.ts (new), src/sync/countingDb.ts (new), test/sync/budget.spec.ts (new), test/sync/countingDb.spec.ts (new) | dev | done | 0 | lead approved; deps: TASK-54, TASK-56, TASK-62 (done); no shared files |
| [TASK-66](tasks/TASK-66.md) | backend | migrations/0004_sync_budget.sql (new), src/db/syncState.ts, src/db/syncFiles.ts (new), test/migrations/0004_sync_budget.spec.ts (new), test/db/syncState.spec.ts, test/db/syncFiles.spec.ts (new), plus any existing spec pinning sync_state columns or migration count | dev | done | 1 | lead approved after one design rework (sync_tab_checks table instead of ALTER, see task file); question answered (TASK-64 owns the other red files); deps: TASK-54, TASK-56, TASK-62 (done); no shared files with 63 and 65 |
| [TASK-67](tasks/TASK-67.md) | backend | src/sync/sheetSource.ts, src/sync/publicGoogleSource.ts, test/sync/publicGoogleSource.spec.ts, test/fixtures/google/*.html (folder fixture only), test/fakes/sheetSource.ts (only if needed) | dev | done | 0 | deps: TASK-64 (and so TASK-63); third in the publicGoogleSource.ts chain |
| [TASK-68](tasks/TASK-68.md) | backend | src/sync/runSync.ts, src/db/syncRuns.ts, test/sync/runSync.spec.ts, test/db/syncRuns.spec.ts | dev | done | 0 | lead approved; deps: TASK-63, TASK-65 (both done); first of runSync.ts editors 68, 69, 70 (in that order) |
| [TASK-69](tasks/TASK-69.md) | backend | src/sync/runSync.ts, test/sync/runSync.spec.ts | dev | done | 1 | approved after one rework (see task file ## Review); deps: TASK-65, TASK-66, TASK-68; second of runSync.ts editors |
| [TASK-70](tasks/TASK-70.md) | backend | src/sync/runSync.ts, test/sync/runSync.spec.ts, test/sync/runSyncListing.spec.ts (new) | dev | done | 0 | lead approved; deps: TASK-66, TASK-67, TASK-69; third of runSync.ts editors; AC7 reduced and listing gate reserves 16 (lead answers in task file); parallel with TASK-72 (disjoint) |
| [TASK-72](tasks/TASK-72.md) | backend | migrations/0004_sync_budget.sql, src/db/syncState.ts, src/sync/syncHotel.ts, test/migrations/0004_sync_budget.spec.ts, test/db/syncState.spec.ts, test/sync/syncHotel.spec.ts | dev | done | 0 | lead approved; deps: TASK-66, TASK-69 (done); amends 0004 in place (file_modified, parser_version on sync_tab_checks); parallel with TASK-70 (disjoint) |
| [TASK-73](tasks/TASK-73.md) | backend | src/sync/runSync.ts, test/sync/runSync.spec.ts, test/sync/runSyncReadSkip.spec.ts (new) | dev | done | 0 | lead approved; deps: TASK-72, TASK-70, TASK-69 (all done); fourth of runSync.ts editors; must pass fileModified and parserVersion in the markTabsChecked meta for unchanged tabs too (lead's review of TASK-72), else file_modified goes stale and the tab is re-read every run |
| [TASK-71](tasks/TASK-71.md) | backend | src/site.ts, wrangler.hotel.jsonc, DEPLOY-hotel-dictionary.md, test/web/siteSync.spec.tsx, test/web/site-config.spec.ts, test/web/site.spec.tsx (only if needed) | dev | blocked | 2 | second rework: doc figure for first full convergence is wrong (about 18 runs); escalated to the user; waiting for the user's decision; do not dispatch |

Sequencing note (live sync failure fix, from lead): TASK-63 then 64 then 67 share publicGoogleSource.ts; TASK-68, 69, 70 edit runSync.ts in that order; DEPLOY-hotel-dictionary.md is edited by TASK-64 then TASK-71; TASK-71 runs last. TASK-63, 65 and 66 are disjoint and run first in parallel. Idle-run addendum: TASK-70 and TASK-72 run in parallel (disjoint files), then TASK-73 (runSync.ts, after 70 and 72), then TASK-71 last. WARNING to the owner: migration 0004 was amended in place; do not apply 0004 from an intermediate commit, apply it only after TASK-71 is merged.

Board note: Live sync failure fix (first live run: 451 csv_network failures, 27 min): suspect Workers subrequest limit; owner asked: Workers plan Free or Paid, skip-list confirmation; cron must be paused by the owner until TASK-71 is deployed.

Note: Deferred TCs with stale wording after the design restyle (TASK-43/44), update when they are automated: TC-40, TC-41 (column headers now 'Đơn giá (VND)' / 'Price (VND)'; vi title), TC-47, 48, 50, 59, 62 (prose 'Pricing'), TC-49 (edited marker now in the note block; text 'Đã sửa giá' / 'Price edited'); also check any TC quoting the old draft-saved text, intro text, language-link location or button order.
