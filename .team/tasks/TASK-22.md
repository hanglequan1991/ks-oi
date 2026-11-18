# TASK-22: Cities and hotel suggestion queries (src/db/cities.ts, src/db/suggest.ts)

- id: TASK-22
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-2 (schema), TASK-16 (sample data), TASK-17 (`foldText`, `likePrefixPattern`), TASK-1 (fake D1)
- size: fits a 100k-token context (two small queries)

## Why
AC11, AC12 and AC13. Both files take `D1Database` as a parameter, import only `src/domain/`, and use bound parameters only.

`sheet-rag/src/db/cities.ts`:
```ts
export async function listCitiesWithPublishedHotels(db: D1Database): Promise<{ slug: string; name_vi: string; name_en: string | null }[]>;
```
Only cities that have at least one `published` hotel (`EXISTS`), ordered by `name_vi`, then `slug`.

`sheet-rag/src/db/suggest.ts`:
```ts
export interface SuggestRow { slug: string; name: string; city_slug: string; city_name_vi: string; city_name_en: string | null }
export async function suggestHotels(db: D1Database, rawText: string, limit: number): Promise<SuggestRow[]>;
```
Behaviour: `folded = foldText(rawText)`; if `folded` is empty return `[]` without querying. Match published hotels where `name_search LIKE ? ESCAPE '\'` with `likePrefixPattern(folded)` (prefix of the whole folded name, so `mong h` matches `mong hotel`). Order by `name_search, slug`. `limit` is clamped to 1..10 again (default 8 if not a finite number). Uses the index `idx_hotels_status_name`. Only published hotels.

## Acceptance criteria
1. AC11: with the sample data, `listCitiesWithPublishedHotels` returns `da-nang` (`Đà Nẵng` / `Da Nang`) and `ha-noi` (`Hà Nội` / null) in that order of `name_vi`, and not `hue` (its only hotel is hidden); after hiding every `ha-noi` hotel, it disappears.
2. AC12: `suggestHotels(db, 'mo', 8)` returns `mong-hotel` only (not `mong-review`, `mong-hidden`); `'Mộng'`, `'MONG'` and `'mong h'` give the same; `'sao'` returns `sao-hotel`; `'Đông'` and `'dong'` return `dong-do-hotel`; `'ong'` and `'hotel'` return none (prefix match on the whole folded name, not a contains match).
3. AC12: each row has `slug`, `name`, `city_slug` and the city names; the limit is respected: with 60 extra published `Bulk n` hotels, `suggestHotels(db, 'bulk', 5)` returns 5, limit 10 returns 10, limit 99 returns at most 10, limit 0 returns 1.
4. AC13: `'%'`, `'_'`, `'"*'`, `'a OR b'`, `"'; DROP TABLE hotels;--"` and `'***'` never throw and never change data; `'%'` and `'_'` return `[]`, not every hotel; text that folds to empty returns `[]`.

## Unit tests to write
In `test/db/cities.spec.ts` and `test/db/suggest.spec.ts`, fake D1 + `applyMigrations` + `seedApiSample` (+ `seedManyPublished`).
- [ ] `cities lists only cities with published hotels with both names`: covers AC1
- [ ] `suggest matches by accent-free prefix and returns published hotels only`: covers AC2
- [ ] `suggest returns slug, name and city and respects the limit`: covers AC3
- [ ] `suggest is safe with search-syntax and SQL characters`: covers AC4

## Files this task may touch
- `sheet-rag/src/db/cities.ts` (new)
- `sheet-rag/src/db/suggest.ts` (new)
- `sheet-rag/test/db/cities.spec.ts` (new)
- `sheet-rag/test/db/suggest.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Files: `src/db/cities.ts`, `src/db/suggest.ts`, `test/db/cities.spec.ts`, `test/db/suggest.spec.ts` (all new). Tests: 4 new, all passing.
- Deviation (cities order): the task says `ORDER BY name_vi`, but SQLite compares by code point, so `Hà Nội` (H) sorts before `Đà Nẵng` (Đ). AC11 requires `da-nang` first. `cities.ts` therefore sorts in JS by `foldText(name_vi)`, then `name_vi`, then `slug`. The SQL has no ORDER BY. Lead to confirm.
- Empty-folding text (AC4, TC-35 step 3): suggest returns `[]` with no query when `foldText` gives "". This matches the TASK-20 rule (a non-blank q that folds to nothing matches nothing) and TC-35 expects empty items.
- Limit: `Math.floor`, clamped to 1..10; non-finite (NaN) becomes 8. Matches TASK-20's clamp style.
- Full suite: 192 tests pass. `test/client/bill-storage.spec.ts` fails to load (`src/client/bill/storage` missing). Not from this task.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
