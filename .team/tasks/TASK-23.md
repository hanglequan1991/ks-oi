# TASK-23: Hotel list and hotel detail routes (src/web/api/hotels.ts)

- id: TASK-23
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-14 (`WebEnv`, `createApp`, `mount` hook), TASK-5 (settings), TASK-16 (sample data), TASK-18 (serializers), TASK-19 (params, `ApiDeps`), TASK-20 (list query), TASK-21 (detail query)
- size: fits a 100k-token context (two thin routes over finished parts)

## Why
AC1 to AC10 over HTTP. Thin glue: validate, query, read the settings once, serialize. This file does not touch `src/index.ts` or `src/web/app.ts`; it registers routes on an app passed in (the `mount` hook of TASK-14). Rate limiting (group `data`), security headers and `noindex` are already applied by `createApp` for `/api/hotels` and `/api/hotels/*` (STORY-16), so they are not repeated here.

`sheet-rag/src/web/api/hotels.ts`:
```ts
export function registerHotelRoutes(app: Hono<WebEnv>, deps: ApiDeps): void;
```
- `GET /api/hotels`: `parseListParams`; on error respond 400 `{ "error": { "code": "invalid_param", "message": "..." } }` and run no query. Otherwise `listPublishedHotels`, then `getSettings()` called once, then `toHotelListItem` for each row with `{ feePercent: settings.serviceFeePercent, showFeeNote: settings.showFeeNote }`. Response 200: `{ "items": [...], "page", "limit", "total", "totalPages" }` where `limit` is the effective (capped) value and `totalPages = ceil(total / limit)` (0 when no results). `getSettings` is called exactly once per request.
- `GET /api/hotels/:slug`: `lang` from the query (`parseLang`, 400 on invalid). A slug that does not match `^[a-z0-9-]{1,100}$` gives 404. `getPublishedHotelDetail`; `null` gives 404 `{ "error": { "code": "not_found", "message": "Hotel not found" } }`; otherwise `toHotelDetail` with the settings (including both disclaimer texts) and 200.
- Both responses are JSON with `Cache-Control: public, max-age=60` on 200 only.
- A thrown database or settings error is not caught here (the app's `onError` from TASK-14 returns the 500).

## Acceptance criteria
1. AC1: `GET /api/hotels` with sample data returns 200 with the 3 published hotels, `total` 3, `page` 1, `limit` 20, each with `price` (final) and none of `mong-review`, `mong-hidden`; with 60 extra hotels `?limit=50&page=2` returns 13 items and `totalPages` 2.
2. AC2: `?city=da-nang`, `?stars=5`, `?facility=pool`, `?q=Mộng` (URL-encoded) and `?q=mong` each return the matching published hotels only.
3. AC3: `?limit=500` returns 200 with `limit` 50 (not rejected); `?limit=abc`, `?stars=9`, `?sort=zzz`, `?page=0`, `?city=Da%20Nang` return 400 with `error.code` `invalid_param` and a message naming the parameter.
4. AC4: `GET /api/hotels/mong-hotel` returns 200 with facilities, images, 2 rooms, `bookingRules` at hotel level and at room level with `syncedAt`, rule text identical to the seeded text; `?lang=en` returns the English description, city name and facility labels.
5. AC5: `GET /api/hotels/mong-review`, `/api/hotels/mong-hidden`, `/api/hotels/khong-co` and a slug with invalid characters each return 404 `not_found`.
6. AC6: the `Deluxe` room has `price.amount` 1375000, `currency` `VND`, `unit` `night`; list item of `mong-hotel` has `price.amount` 1375000 (lowest priced room), `sao-hotel` 1078000.
7. AC8: the `Standard` room has `price: null`; `dong-do-hotel` in the list has `price: null`; no response contains a price of 0.
8. AC9: with `getSettings` stubbed to fee 20, `mong-hotel` Deluxe is 1500000; with fee 150 it is 2500000 (clamped to 100); the stub is called once per request.
9. AC10: with `showFeeNote` true, prices carry `includesFeePercent` equal to the fee; with false the key is absent.
10. AC7: the full response text of the list and of every sample hotel detail contains none of the strings in `SAMPLE_BASE_PRICE_STRINGS` (and no `base_price`).
11. AC13 (robustness): a `getSettings` that rejects gives a 500 from the app's error handler, not an unhandled crash.

## Unit tests to write
In `test/web/api/hotels.spec.ts`: build `createApp({ getSettings: stub, mount: (app) => registerHotelRoutes(app, { db, getSettings: stub }) })` with the fake D1, `applyMigrations`, `seedApiSample`, and call `app.request(...)`.
- [ ] `list returns published hotels with final prices and paging`: covers AC1
- [ ] `list filters by city, stars, facility and accent-free text`: covers AC2
- [ ] `oversized limit is capped at 50 and invalid values give 400`: covers AC3
- [ ] `detail returns rooms, facilities, images and rules in both languages`: covers AC4
- [ ] `detail is 404 for review, hidden, unknown and malformed slugs`: covers AC5
- [ ] `1,250,000 base price is returned as 1,375,000`: covers AC6
- [ ] `unpriced rooms and hotels carry null, never zero`: covers AC7
- [ ] `changed fee setting changes prices, clamped to 0..100`: covers AC8
- [ ] `fee note flag controls includesFeePercent`: covers AC9
- [ ] `no base price appears in any list or detail response`: covers AC10
- [ ] `settings failure gives 500`: covers AC11

## Files this task may touch
- `sheet-rag/src/web/api/hotels.ts` (new)
- `sheet-rag/test/web/api/hotels.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
