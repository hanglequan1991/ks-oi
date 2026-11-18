# TASK-25: API mount function and end-to-end sweep (src/web/api/index.ts)

- id: TASK-25
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-23 (hotel routes), TASK-24 (meta routes), TASK-3 (seeded settings), TASK-14 (`createApp`)
- size: fits a 100k-token context (small file, one integration test file)

## Why
Gives the Worker entry one function to call, and proves the whole story end to end with the real migrations, seeded settings and sample data. It does not edit `src/index.ts`; wiring `mountApi` into the real Worker entry is part of TASK-15 (blocked until the owner commits the real source), which should call `createApp({ getSettings: () => getSettings(env.DB), mount: mountApi(env.DB, getSettingsFn) })`.

`sheet-rag/src/web/api/index.ts`:
```ts
export function mountApi(deps: ApiDeps): (app: Hono<WebEnv>) => void;   // returns the function to pass as WebDeps.mount; registers registerHotelRoutes and registerMetaRoutes
export { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './types';
```
Only the five public endpoints are registered (`GET /api/hotels`, `/api/hotels/:slug`, `/api/cities`, `/api/suggest`, `/api/config`). No `POST`, `PUT`, `PATCH` or `DELETE` route exists.

## Acceptance criteria
1. Story-wide AC7: for every endpoint and every sample hotel (list pages, each of the 3 published details in both languages, cities in both languages, suggest, config), the response text contains none of `SAMPLE_BASE_PRICE_STRINGS` and none of the words `base_price`, `basePrice`, `min_base_price`.
2. Story-wide AC1 / AC5: across the same sweep, no response mentions `mong-review`, `mong-hidden`, `Mộng Review` or `Mộng Hidden`, except the 404 for their detail URLs (which does not echo the name).
3. Out of scope check: `POST`, `PUT`, `PATCH` and `DELETE` to each of the five endpoints return 404 or 405 (never 200), and `/api/config` has no phone or Zalo data.
4. AC9 end to end: with the real `getSettings` from `src/db/settings.ts` (TASK-5) on the fake D1 after TASK-3's seed: prices use 10; after `UPDATE settings SET value = '20' WHERE key = 'service_fee_percent'` the next request returns the 20 percent price (1,500,000 for Deluxe); `'abc'` falls back to 10 and `'150'` acts as 100; `show_fee_note = 'false'` removes `includesFeePercent`.
5. Security guards still apply: responses carry `X-Robots-Tag: noindex, nofollow` and the five security headers (STORY-16), and the 61st rapid `GET /api/hotels` from one IP gets 429 (60 per minute) without reaching the route.
6. The test runs with no Cloudflare credentials.

## Unit tests to write
In `test/web/api/api.integration.spec.ts` (real `createApp` + `mountApi` + fake D1 + `applyMigrations` + `seedApiSample`).
- [ ] `no endpoint response contains a base price`: covers AC1
- [ ] `non-published hotels never appear anywhere`: covers AC2
- [ ] `only read endpoints exist`: covers AC3
- [ ] `fee setting changes flow from the database to the price`: covers AC4
- [ ] `api responses carry noindex and security headers and are rate limited`: covers AC5
- [ ] `runs with no CLOUDFLARE_API_TOKEN`: covers AC6

## Files this task may touch
- `sheet-rag/src/web/api/index.ts` (new)
- `sheet-rag/test/web/api/api.integration.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
