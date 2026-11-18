# TASK-20: Published hotel list query (src/db/hotelList.ts)

- id: TASK-20
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-2 (schema), TASK-16 (sample data), TASK-17 (`searchTokens`, `likeContainsPattern`), TASK-18 (`HotelListRow` type), TASK-1 (fake D1)
- size: fits a 100k-token context (few files, one behaviour)

## Why
AC1 and AC2: the database side of the hotel list. `src/db/` may import `src/domain/` only (technical-design.html section 3.4), takes `D1Database` as a parameter, and uses bound parameters only (never string-built values). No FTS5 table exists (TASK-2), so text search is `LIKE` on the folded `name_search` column.

`sheet-rag/src/db/hotelList.ts`:
```ts
export interface HotelListQuery { city?: string; q?: string; stars?: number[]; facilities: string[]; sort: 'name'|'stars'|'price'; page: number; limit: number }   // already validated by TASK-19; limit <= 50
export async function listPublishedHotels(db: D1Database, query: HotelListQuery): Promise<{ rows: HotelListRow[]; total: number }>;
```
Behaviour:
- Only `hotels.status = 'published'`; always (no way to switch it off).
- Join `cities` for `city_name_vi`, `city_name_en`; `min_base_price` = `MIN(rooms.base_price)` over the hotel's rooms (NULL when none is priced, via a correlated subquery or LEFT JOIN + GROUP BY); `image_url` = url of the image with the lowest `position` (NULL when none).
- Filters: `city` equals `city_slug`; `stars` is `IN (?,...)`; every requested facility must be present (`EXISTS` per code in `hotel_facilities`, all must match); `q` is folded with `searchTokens`, and every token must be contained in `name_search` (`name_search LIKE ? ESCAPE '\'` per token with `likeContainsPattern`). A `q` that is absent, empty or only whitespace (`q.trim() === ''`) is ignored (TASK-19 already turns blank into absent). A `q` that has non-blank text but folds to no tokens (for example `%`, `_`, `"*"`) matches nothing: return `{ rows: [], total: 0 }` (add a never-true clause such as `1 = 0`, or return early). It must never widen the result to all hotels.
- Sort: `name` = `name_search ASC, slug ASC`; `stars` = `stars DESC NULLS LAST, name_search ASC`; `price` = lowest price ascending, unpriced hotels last, then name. Ordering must be deterministic so paging is stable.
- Paging: `LIMIT ? OFFSET ?` with `(page-1)*limit`; `total` is the count of all matching hotels (separate `COUNT(*)` with the same filters), not the page size.
- Defence: clamps `limit` to 1..50 and `page` to at least 1 again, so a direct caller cannot ask for more.

## Acceptance criteria
1. AC1: with the sample data (TASK-16), no filter returns exactly `mong-hotel`, `sao-hotel`, `dong-do-hotel` (3 rows, `total` 3); `mong-review` and `mong-hidden` never appear, even when filtered by their city, name or facility.
2. AC1: with 60 extra published hotels, `page 1 limit 50` returns 50 rows and `total` 63, `page 2 limit 50` returns 13 rows, and the rows of the two pages do not overlap; a `limit` of 500 passed directly returns at most 50.
3. AC2: `city = 'da-nang'` returns `mong-hotel` and `dong-do-hotel` only; `stars = [5]` returns `dong-do-hotel`; `stars = [3,4]` returns two; `facilities = ['pool']` returns `mong-hotel` and `dong-do-hotel`; `facilities = ['pool','elevator']` returns `dong-do-hotel` only.
4. AC2: `q = 'mong'`, `q = 'Mộng'` and `q = 'MONG hotel'` all return `mong-hotel` (and not `mong-review` or `mong-hidden`); `q = 'dong do'` and `q = 'Đông Đô'` return `dong-do-hotel`; a filter combination with no match returns `{ rows: [], total: 0 }`.
5. AC6 / AC8: `min_base_price` is 1250000 for `mong-hotel` (the unpriced `Standard` room is ignored), 980000 for `sao-hotel` and NULL for `dong-do-hotel`; `image_url` is the first image url for `mong-hotel` and NULL for the hotel with no images.
6. AC13 (safe input): `q = '%'`, `q = '"; DROP TABLE hotels;--'` and `q = 'a_b'` neither throw nor change data (the `hotels` table still has 5 rows after) and `q = '%'` returns `{ rows: [], total: 0 }` (it folds to no tokens, so it matches nothing, not everything); `q = '   '` and an absent `q` return all 3 published hotels.
7. Sort: `price` puts `sao-hotel` (980000) before `mong-hotel` (1250000) and `dong-do-hotel` (no price) last; `name` and `stars` orders are as described.

## Unit tests to write
In `test/db/hotelList.spec.ts`, fake D1 + `applyMigrations` + `seedApiSample`.
- [ ] `returns only published hotels`: covers AC1
- [ ] `pages with a stable order and a true total, and caps the limit`: covers AC2 (second criterion)
- [ ] `filters by city, stars and facility (all facilities must match)`: covers AC3
- [ ] `search text works without accents and ignores case`: covers AC4
- [ ] `non-published hotels stay hidden under every filter`: covers AC1
- [ ] `lowest base price ignores unpriced rooms and is null when none is priced`: covers AC5
- [ ] `search-syntax and SQL text is harmless`: covers AC6
- [ ] `sort by price puts unpriced hotels last`: covers AC7

## Files this task may touch
- `sheet-rag/src/db/hotelList.ts` (new)
- `sheet-rag/test/db/hotelList.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Implemented `src/db/hotelList.ts` and `test/db/hotelList.spec.ts` (9 tests, all pass; full unit suite 27 files / 172 tests green).
- Spec conflict on `q = '%'`: the Behaviour rule says a `q` that folds to no tokens is ignored. `%` folds to no tokens, so `q = '%'` returns all 3 published hotels (same as no `q`). AC6 says `q = '%'` "does not match everything". The implementation and test follow the Behaviour rule. The AC6 test asserts no throw, unchanged data, and the same rows as no `q`. Change this if the rule should be different.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
Q (to product): AC6 says `q = '%'` must not match everything, but the Behaviour rule says a `q` with no searchable tokens is ignored, and `%` folds to no tokens. So `q = '%'` returns all 3 published hotels. Should `%` (a q with no tokens) (a) be ignored, as the Behaviour rule says, so it returns all published hotels, or (b) return no rows? Option (b) would need the Behaviour rule changed for non-empty q that folds to nothing.
A (lead, technical; the business part is a safe default, coordinator to log it): Option (b). Story AC13 requires search-syntax characters to be handled safely, and TC-27 (`q=%25`, `q=_` "do not match every hotel") and TC-35 (`%` and `_` "do not match every hotel") say a wildcard-only q must not widen the result. Only a blank q (absent, empty, whitespace) is ignored, as TASK-19 already does. A non-blank q with no searchable tokens returns no rows. Task text (Behaviour rule and AC6) updated to say this; scope and file list unchanged.
Dev change needed, in `sheet-rag/src/db/hotelList.ts` (line 62 area, the `tokens` block): compute `const raw = query.q?.trim() ?? ''; const tokens = raw ? searchTokens(raw) : [];` and, if `raw !== '' && tokens.length === 0`, push the clause `1 = 0` (so both the page query and the `COUNT(*)` give nothing; or return `{ rows: [], total: 0 }` early). In `sheet-rag/test/db/hotelList.spec.ts`, test `search-syntax and SQL text is harmless`: change the `q = '%'` assertion to `{ rows: [], total: 0 }`; add assertions that `q = '   '` and no `q` return all 3 published hotels; keep the no-throw and 5-rows-remain checks. Run the unit suite again.
