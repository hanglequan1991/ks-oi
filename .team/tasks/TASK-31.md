# TASK-31: Lookup router (request to HTML response)

- id: TASK-31
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-16, TASK-17, TASK-20, TASK-21, TASK-25, TASK-26, TASK-30
- size: fits ~8k tokens with context (one small module, signatures only as context)

## Acceptance criteria
Covers STORY-11: AC9..AC20 (query string drives the directory: wiring), AC22 (no data: page renders, no error), AC28 (details link target exists), AC37 (unknown hotel id -> "hotel not found" page, HTTP 404), AC42 (data loaded on every request; last good data on failure), AC43 (skipped rows never appear; no error).
1. `GET /hotels` renders the directory from the query string; `GET /hotels/<id>` renders the detail page; unknown id or malformed id -> not-found page with status 404.
2. Any other path or non-GET/HEAD method -> `null` (the caller continues with other routes, e.g. the chatbot).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/router.ts`. Imports:
```ts
import { loadDirectory, defaultCache } from "./store";    // loadDirectory(source, cache): Promise<DirectoryData> (never throws); defaultCache: DirectoryCache
import type { DirectorySource, DirectoryCache } from "./store";
import { parseQuery } from "./query";                      // parseQuery(params: URLSearchParams): DirectoryQuery
import { toListHotel } from "./cards";                     // toListHotel(hotel, fees, today): ListHotel
import { buildDirectoryModel } from "./directoryModel";    // buildDirectoryModel(list: ListHotel[], query): DirectoryModel
import { renderDirectoryPage } from "./view/directoryPage"; // (model) => string (full HTML)
import { buildDetailModel } from "./detailModel";          // buildDetailModel(data, id, today): DetailModel | null
import { renderDetailPage, renderNotFoundPage } from "./view/detailPage"; // (model) => string ; () => string
```
Exports exactly:
```ts
export async function handleLookup(request: Request, source: DirectorySource | null | undefined, now: Date = new Date(), cache: DirectoryCache = defaultCache): Promise<Response | null>
```
- Only `GET` and `HEAD`; other methods -> `null`.
- `url = new URL(request.url)`; `path = url.pathname`; strip ONE trailing slash when `path.length > 1`.
- `today = now.toISOString().slice(0, 10)`.
- `path === "/hotels"`: `data = await loadDirectory(source, cache)`; `list = data.hotels.map(h => toListHotel(h, data.fees, today))`; `model = buildDirectoryModel(list, parseQuery(url.searchParams))`; return `html(renderDirectoryPage(model), 200)`.
- `path` matches `/hotels/<one segment>`: `id` = `decodeURIComponent(segment)` inside try/catch (malformed -> not found); `data = await loadDirectory(source, cache)`; `model = buildDetailModel(data, id, today)`; found -> `html(renderDetailPage(model), 200)`; else `html(renderNotFoundPage(), 404)`. Empty segment or extra segments (`/hotels/a/b`) -> not found 404 for `/hotels/a/b`; `/hotels/` is the directory (after trailing-slash strip).
- Any other path -> `null`.
- `html(body, status)` = `new Response(request.method === "HEAD" ? null : body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } })`.
- Tests use a fake source `{ get: async () => JSON.stringify({ hotels: [...], fees: [...], contact: {...} }) }` and `createCache()` from `./store` for isolation; no network.
- Examples: source with hotel {id:"1",name:"Đà Nẵng Beach Hotel",city:"Đà Nẵng",rooms:[{type:"Std",basePrice:1000000}]} and fee 10% global: `GET http://x/hotels?q=da+nang` -> 200, body contains `Đà Nẵng Beach Hotel` and `1.100.000 ₫`; `GET /hotels?q=zzz` -> 200 containing `Không tìm thấy khách sạn phù hợp.`; `GET /hotels/1` -> 200 with the name; `GET /hotels/999` -> 404 containing `Không tìm thấy khách sạn`; `GET /hotels/%E0%A4%A` (malformed) -> 404; `GET /` -> null; `GET /api` -> null; `POST /hotels` -> null; source `null` -> `/hotels` 200 with `Hiện chưa có khách sạn nào.`; source whose `get` throws after one success -> still 200 with the old data; `HEAD /hotels` -> 200, empty body; response never contains the base price `1.000.000 ₫` nor `%`.

## Unit tests to write
- [ ] `GET /hotels lists hotels with final prices and honours the query string`: covers AC9, AC15, AC19, AC20, AC24
- [ ] `no match shows the empty message with 200`: covers AC21
- [ ] `no data or null source renders the empty-state page`: covers AC22
- [ ] `GET /hotels/<id> renders detail; unknown or malformed id gives 404 not-found page`: covers AC37
- [ ] `other paths and methods return null`: covers routing
- [ ] `each request reloads data; a failing source serves last good data`: covers AC42
- [ ] `rows with missing id or name never appear`: covers AC43
- [ ] `response has html content type, no-cache, and no base price`: covers AC26, AC42

## Files this task may touch
- `sheet-rag/src/lookup/router.ts`
- `sheet-rag/test/lookup/router.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/router.spec.ts`

## Dev notes

## Review

## Questions
