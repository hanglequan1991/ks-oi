# TASK-24: Cities, suggest and public settings routes (src/web/api/meta.ts)

- id: TASK-24
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-14 (`WebEnv`, `createApp`, `mount` hook), TASK-5 (settings), TASK-16 (sample data), TASK-18 (`toCityItem`), TASK-19 (params, `ApiDeps`), TASK-22 (cities and suggest queries)
- size: fits a 100k-token context (three small routes)

## Why
AC11 to AC14 over HTTP. Registers routes on an app passed in (the `mount` hook); does not edit `src/index.ts` or `src/web/app.ts`. Rate limiting (`suggest` group, 120 per minute; `data` group), the 60-character input cap on `/api/suggest`, security headers and `noindex` come from `createApp` (STORY-16).

`sheet-rag/src/web/api/meta.ts`:
```ts
export function registerMetaRoutes(app: Hono<WebEnv>, deps: ApiDeps): void;
```
- `GET /api/cities`: `lang` optional (`parseLang`, 400 on invalid). Response 200 `{ "items": [{ slug, name, nameVi, nameEn }] }` using `toCityItem`; only cities with published hotels.
- `GET /api/suggest?q=&limit=&lang=`: `parseSuggestParams`; error gives 400 `{ "error": { "code": "invalid_q" | "invalid_param", "message": "..." } }` and no query. Otherwise `suggestHotels`; response 200 `{ "items": [{ slug, name, city }] }` where `city` is the city name in the requested language (Vietnamese fallback). Items hold only `slug`, `name`, `city` (no price, no ids). No settings read. `Cache-Control: public, max-age=30` on 200.
- `GET /api/config`: calls `getSettings()` once; 200 `{ "disclaimer": { "vi": "...", "en": "..." }, "showFeeNote": boolean, "serviceFeePercent": number, "languages": ["vi","en"] }`. It never includes a phone number, a Zalo link or any contact field in Version 1 (Decision 2026-11-18, billing page shows none), and nothing else from the settings table. `Cache-Control: public, max-age=60`.
- Errors thrown by the database or settings are left to the app's `onError` (500).

## Acceptance criteria
1. AC11: `GET /api/cities` with sample data returns `da-nang` (`name` `Đà Nẵng`, `nameVi` `Đà Nẵng`, `nameEn` `Da Nang`) and `ha-noi` (`nameEn` null) and not `hue`; `?lang=en` gives `name` `Da Nang` for da-nang and `Hà Nội` (fallback) for ha-noi.
2. AC12: `GET /api/suggest?q=mo` returns `[{ slug: 'mong-hotel', name: 'Mộng Hotel', city: 'Đà Nẵng' }]` only; `q=Mộng` gives the same; `limit` of 1 to 10 is respected and defaults to 8 (with 60 bulk hotels, `q=bulk` returns 8, `q=bulk&limit=10` returns 10); `lang=en` gives city `Da Nang`.
3. AC12: review and hidden hotels are never suggested (`q=mong` does not return `Mộng Review` or `Mộng Hidden`).
4. AC13: `q` missing, empty, blank or 61 characters returns 400 `invalid_q`; `limit=0` and `limit=11` return 400; `q=%25`, `q=_`, `q=%22*%22`, `q=a%20OR%20b` and an SQL-injection string return 200 with an empty `items` (or only genuine prefix matches), no 500, and the `hotels` table is unchanged.
5. AC14: `GET /api/config` returns both disclaimer texts equal to the seeded texts from TASK-3, `showFeeNote` true, `serviceFeePercent` 10 and `languages` `['vi','en']`; the response has no key containing `phone`, `zalo`, `tel` or `contact` and no value matching a phone number or `zalo.me`.
6. AC14 / AC9: after the settings stub returns fee 12 and fee note false, the response shows 12 and `false`.
7. AC7: the responses of the three endpoints contain none of the strings in `SAMPLE_BASE_PRICE_STRINGS`.

## Unit tests to write
In `test/web/api/meta.spec.ts`, using `createApp` with `mount` + fake D1 + `seedApiSample` (+ `seedManyPublished`) and `app.request`.
- [ ] `cities lists published-hotel cities with both names and language fallback`: covers AC1
- [ ] `suggest returns slug, name and city for accent-free prefixes and respects limit`: covers AC2
- [ ] `suggest never returns review or hidden hotels`: covers AC3
- [ ] `suggest rejects empty, blank, long text and bad limit, and survives hostile text`: covers AC4
- [ ] `config returns disclaimers, fee note flag and fee percent without contact data`: covers AC5
- [ ] `config follows a changed settings value`: covers AC6
- [ ] `no base price appears in cities, suggest or config`: covers AC7

## Files this task may touch
- `sheet-rag/src/web/api/meta.ts` (new)
- `sheet-rag/test/web/api/meta.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Files: `sheet-rag/src/web/api/meta.ts` (new), `sheet-rag/test/web/api/meta.spec.ts` (new). src/index.ts and src/web/app.ts not touched.
- Tests: 8 in meta.spec.ts (the 7 listed plus 1 extra: invalid lang on /api/cities gives 400). `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/web/api/meta.spec.ts`: 8 passed.
- `/api/config` calls `deps.getSettings()` once and returns only the five fields; `/api/suggest` never reads settings.
- Language on the JSON routes comes from the `lang` query parameter (parseLang / parseSuggestParams), not the path, so no `/en` variants are needed for these routes.
- Full unit run: 255 of 256 pass. The one failure is `test/web/api/hotels.spec.ts` (oversized limit test, another dev's file), not my files.

## Review
Verdict: approve (lead, 2026-11-18). Full run: 40 files, 269 tests passed.
- Tests cover AC1 to AC7 (8 tests, 7 named plus invalid-lang on /api/cities). Only `src/web/api/meta.ts` and its spec are new.
- `/api/config` returns exactly `disclaimer {vi,en}`, `showFeeNote`, `serviceFeePercent`, `languages`; no phone, Zalo or contact field; settings read once; test checks key names and value patterns.
- `/api/suggest`: `parseSuggestParams` before any query (400 `invalid_q`/`invalid_param`), limit 1 to 10 default 8, items are only `slug`, `name`, `city` (language with Vietnamese fallback via `toCityItem`), no settings read, Cache-Control 30 on 200 only. Hostile text test passes (no 500, table unchanged).
- `/api/cities`: both names, fallback for `ha-noi`, only cities with published hotels (`hue` absent).
- Only GET routes. No file outside the list changed. Note: the dev saw one failing hotels.spec test during their run; it is green now.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
