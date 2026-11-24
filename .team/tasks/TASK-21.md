# TASK-21: Directory view model (filter, letters, sort, paging pipeline)

- id: TASK-21
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-5, TASK-6, TASK-7, TASK-8, TASK-9, TASK-10, TASK-2 (formatVnd), TASK-16, TASK-20
- size: fits ~8k tokens with context (one composing module, signatures only as context)

## Acceptance criteria
Covers STORY-11: AC4, AC6 (option lists), AC9, AC10, AC14, AC15, AC17, AC18, AC19, AC20, AC21, AC22, AC24, AC25, AC29 (composition of TASK-5..10).
1. AC15: order of operations = filter (query, city, stars, facilities) -> letter counts -> letter restriction -> sort -> paging; sort applies to the filtered result.
2. AC17: letter counts reflect the current filters but NOT the letter restriction itself.
3. AC19/AC20: only the first `pages * 12` cards are returned; `hasMore` true while more remain.
4. AC21/AC22: `state` is "no-data" (no hotels at all), "no-match", or "list".
5. AC24/AC25: card `priceText` = `formatVnd(fromPrice)` or `null`.
6. AC29: each card has the first 4 tags and `extraTags`.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/directoryModel.ts`. Imports (signatures from earlier tasks):
```ts
import type { ListHotel } from "./cards";
import type { DirectoryQuery } from "./query";                  // { q, city, minStars:0|3|4|5, facilities:string[], letter:string|null, sort:"name"|"price"|"stars", pages:number }
import { distinctCities, distinctFacilities } from "./options";  // (string[]) => string[]; (string[][]) => string[]
import { filterHotels } from "./filter";                         // filterHotels(hotels, {query,city,minStars,facilities})
import { sortHotels } from "./sort";                             // sortHotels(hotels, order)
import { LETTERS, letterCounts, filterByLetter } from "./browse"; // LETTERS: readonly string[]; letterCounts(names): Record<string,number>; filterByLetter(hotels, letter|null)
import { PAGE_SIZE, pageItems, hasMore, listState } from "./paging"; // pageItems(items, pages), hasMore(total, pages), listState(totalHotels, matched): "no-data"|"no-match"|"list"
import type { ListState } from "./paging";
import { splitTags } from "./tags";                              // splitTags(tags): {shown: string[]; extra: number}
import { formatVnd } from "./price";                             // formatVnd(n): "1.100.000 ₫"
```
Exports exactly:
```ts
export interface CardModel { id: string; name: string; city: string; area: string; stars: number | null; tags: string[]; extraTags: number; priceText: string | null }
export interface LetterModel { letter: string; count: number; enabled: boolean; selected: boolean }
export interface DirectoryModel { query: DirectoryQuery; state: ListState; cities: string[]; facilities: string[]; letters: LetterModel[]; cards: CardModel[]; total: number; hasMore: boolean }
export function buildDirectoryModel(hotels: ListHotel[], query: DirectoryQuery): DirectoryModel
```
Algorithm (follow exactly):
1. `cities = distinctCities(hotels.map(h => h.city))`; `facilities = distinctFacilities(hotels.map(h => h.facilities))` (from ALL hotels, so options never shrink).
2. `filtered = filterHotels(hotels, { query: query.q, city: query.city, minStars: query.minStars, facilities: query.facilities })`.
3. `counts = letterCounts(filtered.map(h => h.name))`; `letters = LETTERS.map(l => ({ letter: l, count: counts[l] ?? 0, enabled: (counts[l] ?? 0) > 0, selected: query.letter === l }))`.
4. `byLetter = filterByLetter(filtered, query.letter)`; `sorted = sortHotels(byLetter, query.sort)`; `total = sorted.length`.
5. `state = listState(hotels.length, total)`; `visible = pageItems(sorted, query.pages)`; `hasMore = hasMore(total, query.pages)` (name the local differently from the imported function).
6. `cards = visible.map(h => { const t = splitTags(h.facilities); return { id: h.id, name: h.name, city: h.city, area: h.area, stars: h.stars, tags: t.shown, extraTags: t.extra, priceText: h.fromPrice === null ? null : formatVnd(h.fromPrice) }; })`.
- Return `{ query, state, cities, facilities, letters, cards, total, hasMore }`.
- Examples (ListHotel fields id,name,city,area,stars,facilities,fromPrice): 30 hotels, default query -> `cards.length` 12, `hasMore` true, `total` 30; `pages:3` -> 30 cards (12*3 capped), `hasMore` false; `[]` hotels -> state "no-data", cards []; query `q:"zzz"` -> state "no-match", total 0, `hasMore` false; hotels "Dalat","Đà Nẵng","Hue" -> letters D count 1 enabled, Đ count 1, E count 0 disabled; with `city:"Huế"` letters reflect only Huế hotels; with `letter:"Đ"` only Đ hotels are cards but `letters` counts are unchanged and Đ has `selected: true`; sort "price" with fromPrice [900000, null, 500000] -> order 500000, 900000, null and priceText "500.000 ₫" first; fromPrice null -> priceText null; 6 facilities -> tags 4, extraTags 2.

## Unit tests to write
- [ ] `options lists come from all hotels (cities and facilities)`: covers AC4, AC6, AC9
- [ ] `filters combine and default query returns all`: covers AC8, AC10
- [ ] `sort is applied to filtered result and default is name`: covers AC14, AC15
- [ ] `letter counts reflect filters but not the letter restriction; disabled letters`: covers AC17
- [ ] `selected letter restricts cards; counts unchanged`: covers AC18
- [ ] `first page is 12 cards with hasMore, pages=3 shows all`: covers AC19, AC20
- [ ] `state is no-data, no-match or list`: covers AC21, AC22
- [ ] `priceText formatted or null`: covers AC24, AC25
- [ ] `card tags limited to 4 with extra count`: covers AC29

## Files this task may touch
- `sheet-rag/src/lookup/directoryModel.ts`
- `sheet-rag/test/lookup/directoryModel.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/directoryModel.spec.ts`

## Dev notes

## Review

## Questions
