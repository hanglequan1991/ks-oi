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

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-1](testcases/TC-1.md) | qa | e2e/TC-1.e2e.ts | - | todo | 0 | |
| [TC-2](testcases/TC-2.md) | qa | e2e/TC-2.e2e.ts | - | todo | 0 | |
| [TC-3](testcases/TC-3.md) | qa | e2e/TC-3.e2e.ts | - | todo | 0 | |
| [TC-4](testcases/TC-4.md) | qa | e2e/TC-4.e2e.ts | - | todo | 0 | |
| [TC-5](testcases/TC-5.md) | qa | e2e/TC-5.e2e.ts | - | todo | 0 | |
| [TC-6](testcases/TC-6.md) | qa | e2e/TC-6.e2e.ts | - | todo | 0 | |
| [TC-7](testcases/TC-7.md) | qa | e2e/TC-7.e2e.ts | - | todo | 0 | |
| [TC-8](testcases/TC-8.md) | qa | e2e/TC-8.e2e.ts | - | todo | 0 | |
| [TC-9](testcases/TC-9.md) | qa | e2e/TC-9.e2e.ts | - | todo | 0 | |
| [TC-10](testcases/TC-10.md) | qa | e2e/TC-10.e2e.ts | - | todo | 0 | needs a live deployment (real Cloudflare D1) |

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
| [TASK-14](tasks/TASK-14.md) | backend | src/web/app.ts, test/web/app.spec.tsx | dev | in-progress | 0 | deps: TASK-5, TASK-7, TASK-9, TASK-11, TASK-12, TASK-13; TASK-13's body-size check only runs when bodyFields is non-empty; wiring must always pass bodyFields on POST routes |
| [TASK-15](tasks/TASK-15.md) | backend | src/index.ts, src/env.ts (new if needed), wrangler.jsonc, test/index.web.spec.ts (provisional list) | - | blocked | 0 | waiting for the owner's real sheet-rag source (src/index.ts, src/rag/); deps: TASK-14, TASK-10, TASK-9; TASK-13's body-size check only runs when bodyFields is non-empty; wiring must always pass bodyFields on POST routes |

QA test cases for STORY-16 (TC-11 to TC-22 need Playwright from TASK-39 and, for real runs, TASK-15; TC-23 and TC-24 need a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-11](testcases/TC-11.md) | qa | e2e/TC-11.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-12](testcases/TC-12.md) | qa | e2e/TC-12.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-13](testcases/TC-13.md) | qa | e2e/TC-13.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-14](testcases/TC-14.md) | qa | e2e/TC-14.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-15](testcases/TC-15.md) | qa | e2e/TC-15.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-16](testcases/TC-16.md) | qa | e2e/TC-16.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-17](testcases/TC-17.md) | qa | e2e/TC-17.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-18](testcases/TC-18.md) | qa | e2e/TC-18.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-19](testcases/TC-19.md) | qa | e2e/TC-19.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-20](testcases/TC-20.md) | qa | e2e/TC-20.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-21](testcases/TC-21.md) | qa | e2e/TC-21.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-22](testcases/TC-22.md) | qa | e2e/TC-22.e2e.ts | - | todo | 0 | needs Playwright (TASK-39) |
| [TC-23](testcases/TC-23.md) | qa | e2e/TC-23.e2e.ts | - | todo | 0 | needs a live deployment |
| [TC-24](testcases/TC-24.md) | qa | e2e/TC-24.e2e.ts | - | todo | 0 | needs a live deployment |

## STORY-15: Hotel public API

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-16](tasks/TASK-16.md) | backend | test/fixtures/apiSample.ts, test/fixtures/apiSample.spec.ts | dev | done | 0 | deps: TASK-2, TASK-3, TASK-1; lead approved |
| [TASK-17](tasks/TASK-17.md) | backend | src/domain/fold.ts, test/domain/fold.spec.ts | dev | done | 0 | deps: TASK-1 |
| [TASK-18](tasks/TASK-18.md) | backend | src/domain/hotelView.ts, test/domain/hotelView.spec.ts | dev | done | 0 | deps: TASK-4, TASK-1; lead approved |
| [TASK-19](tasks/TASK-19.md) | backend | src/web/api/params.ts, src/web/api/types.ts, test/web/api/params.spec.ts | dev | done | 0 | deps: TASK-5, TASK-1; lead approved |
| [TASK-20](tasks/TASK-20.md) | backend | src/db/hotelList.ts, test/db/hotelList.spec.ts | dev | done | 0 | deps: TASK-2, TASK-16, TASK-17, TASK-18, TASK-1; lead approved |
| [TASK-21](tasks/TASK-21.md) | backend | src/db/hotelDetail.ts, test/db/hotelDetail.spec.ts | dev | done | 0 | deps: TASK-2, TASK-16, TASK-18, TASK-1; lead approved |
| [TASK-22](tasks/TASK-22.md) | backend | src/db/cities.ts, src/db/suggest.ts, test/db/cities.spec.ts, test/db/suggest.spec.ts | dev | review | 0 | deps: TASK-2, TASK-16, TASK-17, TASK-1 |
| [TASK-23](tasks/TASK-23.md) | backend | src/web/api/hotels.ts, test/web/api/hotels.spec.ts | - | todo | 0 | deps: TASK-14, TASK-5, TASK-16, TASK-18, TASK-19, TASK-20, TASK-21 |
| [TASK-24](tasks/TASK-24.md) | backend | src/web/api/meta.ts, test/web/api/meta.spec.ts | - | todo | 0 | deps: TASK-14, TASK-5, TASK-16, TASK-18, TASK-19, TASK-22 |
| [TASK-25](tasks/TASK-25.md) | backend | src/web/api/index.ts, test/web/api/api.integration.spec.ts | - | todo | 0 | deps: TASK-23, TASK-24, TASK-3, TASK-14 |

QA test cases for STORY-15 (TC-39 needs a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-25](testcases/TC-25.md) | qa | e2e/TC-25.e2e.ts | - | todo | 0 | |
| [TC-26](testcases/TC-26.md) | qa | e2e/TC-26.e2e.ts | - | todo | 0 | |
| [TC-27](testcases/TC-27.md) | qa | e2e/TC-27.e2e.ts | - | todo | 0 | |
| [TC-28](testcases/TC-28.md) | qa | e2e/TC-28.e2e.ts | - | todo | 0 | |
| [TC-29](testcases/TC-29.md) | qa | e2e/TC-29.e2e.ts | - | todo | 0 | |
| [TC-30](testcases/TC-30.md) | qa | e2e/TC-30.e2e.ts | - | todo | 0 | |
| [TC-31](testcases/TC-31.md) | qa | e2e/TC-31.e2e.ts | - | todo | 0 | |
| [TC-32](testcases/TC-32.md) | qa | e2e/TC-32.e2e.ts | - | todo | 0 | |
| [TC-33](testcases/TC-33.md) | qa | e2e/TC-33.e2e.ts | - | todo | 0 | |
| [TC-34](testcases/TC-34.md) | qa | e2e/TC-34.e2e.ts | - | todo | 0 | |
| [TC-35](testcases/TC-35.md) | qa | e2e/TC-35.e2e.ts | - | todo | 0 | |
| [TC-36](testcases/TC-36.md) | qa | e2e/TC-36.e2e.ts | - | todo | 0 | |
| [TC-37](testcases/TC-37.md) | qa | e2e/TC-37.e2e.ts | - | todo | 0 | |
| [TC-38](testcases/TC-38.md) | qa | e2e/TC-38.e2e.ts | - | todo | 0 | |
| [TC-39](testcases/TC-39.md) | qa | e2e/TC-39.e2e.ts | - | todo | 0 | needs a live deployment |

## STORY-11: Billing page (/bill, /en/bill)

Sequencing note: package.json and package-lock.json are edited by TASK-1, TASK-6, TASK-34 and TASK-39, so these four must run sequentially in that order, never in parallel. TASK-27 is the only STORY-11 task editing vi.ts/en.ts (do not run in parallel with other tasks that edit them).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TASK-26](tasks/TASK-26.md) | backend | src/domain/money.ts, test/domain/money.spec.ts | dev | done | 0 | deps: TASK-1 (test runner only) |
| [TASK-27](tasks/TASK-27.md) | frontend | src/web/i18n/vi.ts, src/web/i18n/en.ts, test/web/i18n/bill-keys.spec.ts | dev | done | 0 | lead approved; deps: TASK-7; sole STORY-11 editor of vi.ts/en.ts |
| [TASK-28](tasks/TASK-28.md) | frontend | src/client/bill/state.ts, test/client/bill-state.spec.ts | dev | done | 0 | lead approved; deps: TASK-26, TASK-6 |
| [TASK-29](tasks/TASK-29.md) | frontend | src/client/bill/storage.ts, test/client/bill-storage.spec.ts | dev | review | 0 | deps: TASK-28, TASK-26 |
| [TASK-30](tasks/TASK-30.md) | frontend | src/client/bill/combobox.ts, test/client/bill-combobox.spec.ts | dev | in-progress | 0 | deps: TASK-17, TASK-6 |
| [TASK-31](tasks/TASK-31.md) | frontend | src/client/bill/format.ts, test/client/bill-format.spec.ts | dev | done | 0 | deps: TASK-26, TASK-6; lead approved |
| [TASK-32](tasks/TASK-32.md) | frontend | src/client/bill/api.ts, test/client/bill-api.spec.ts | dev | in-progress | 0 | deps: TASK-28, TASK-6; server contract TASK-23/TASK-24 (tested with fake fetch) |
| [TASK-33](tasks/TASK-33.md) | frontend | public/bill.css, test/client/bill-css.spec.ts | dev | done | 0 | lead approved; deps: TASK-6; does not touch public/app.css (TASK-9) |
| [TASK-34](tasks/TASK-34.md) | backend | scripts/build-client.mjs, package.json (three scripts + esbuild devDependency), package-lock.json, .gitignore, test/client/build.spec.ts | dev | done | 0 | lead approved; deps: TASK-6, TASK-1, TASK-26 (money.ts parseVnd; lead answer); must wait until TASK-26 is done; package.json/package-lock.json sequence: TASK-1, 6, 34, 39 (sequential) |
| [TASK-35](tasks/TASK-35.md) | frontend | src/client/bill/viewModel.ts, src/client/bill/render.ts, test/client/bill-viewmodel.spec.ts | dev | done | 0 | deps: TASK-28, TASK-31, TASK-26, TASK-33 (read-only class contract); lead approved |
| [TASK-36](tasks/TASK-36.md) | frontend | src/client/bill/config.ts, src/client/bill/main.ts, test/client/bill-config.spec.ts, test/client/bill-guard.spec.ts | - | todo | 0 | deps: TASK-28, TASK-29, TASK-30, TASK-31, TASK-32, TASK-35, TASK-34, TASK-26 |
| [TASK-37](tasks/TASK-37.md) | frontend | src/web/pages/Bill.tsx, test/web/pages/bill-page.spec.tsx | dev | in-progress | 0 | deps: TASK-9, TASK-8, TASK-27, TASK-7, TASK-5, TASK-33, TASK-6, TASK-26 |
| [TASK-38](tasks/TASK-38.md) | backend | src/web/routes/bill.ts, test/web/routes/bill.spec.tsx | - | todo | 0 | deps: TASK-37, TASK-14, TASK-9, TASK-5 (registered via mount hook; app.ts not edited) |
| [TASK-39](tasks/TASK-39.md) | backend | package.json (@playwright/test devDependency + e2e script), package-lock.json, playwright.config.ts, test/client/playwright-config.spec.ts | dev | done | 0 | lead approved; deps: TASK-34, TASK-6; last in package.json sequence (TASK-1, 6, 34, 39); real e2e runs also need TASK-15 (blocked on owner) |

QA test cases for STORY-11 (TC-40 owns the shared harness e2e/support/billServer.ts and must be done first; TC-62 needs a live deployment).

| Task | Type | Files | Assignee | Status | Rework count | Notes |
|---|---|---|---|---|---|---|
| [TC-40](testcases/TC-40.md) | qa | e2e/TC-40.e2e.ts, e2e/support/billServer.ts | - | todo | 0 | owns shared harness e2e/support/billServer.ts; must be done first |
| [TC-41](testcases/TC-41.md) | qa | e2e/TC-41.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-42](testcases/TC-42.md) | qa | e2e/TC-42.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-43](testcases/TC-43.md) | qa | e2e/TC-43.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-44](testcases/TC-44.md) | qa | e2e/TC-44.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-45](testcases/TC-45.md) | qa | e2e/TC-45.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-46](testcases/TC-46.md) | qa | e2e/TC-46.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-47](testcases/TC-47.md) | qa | e2e/TC-47.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-48](testcases/TC-48.md) | qa | e2e/TC-48.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-49](testcases/TC-49.md) | qa | e2e/TC-49.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-50](testcases/TC-50.md) | qa | e2e/TC-50.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-51](testcases/TC-51.md) | qa | e2e/TC-51.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-52](testcases/TC-52.md) | qa | e2e/TC-52.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-53](testcases/TC-53.md) | qa | e2e/TC-53.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-54](testcases/TC-54.md) | qa | e2e/TC-54.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-55](testcases/TC-55.md) | qa | e2e/TC-55.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-56](testcases/TC-56.md) | qa | e2e/TC-56.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-57](testcases/TC-57.md) | qa | e2e/TC-57.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-58](testcases/TC-58.md) | qa | e2e/TC-58.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-59](testcases/TC-59.md) | qa | e2e/TC-59.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-60](testcases/TC-60.md) | qa | e2e/TC-60.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-61](testcases/TC-61.md) | qa | e2e/TC-61.e2e.ts | - | todo | 0 | after TC-40 |
| [TC-62](testcases/TC-62.md) | qa | e2e/TC-62.e2e.ts | - | todo | 0 | needs a live deployment |
