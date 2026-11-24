# TASK-16: Directory query state (parse and build URL query string)

- id: TASK-16
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none (defines its own `SortKey` literal union identical to TASK-7's `SortOrder`; do not import)
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC9 (city tab = `city` param), AC10 (clearing = default query), AC14 (default sort "name"), AC15 (a filter change keeps the sort), AC18 (letter param), AC19 (pages param), AC20 (filter change restarts paging).
Tech decision (see TASK-19 Questions): the directory is server-rendered; all state lives in the URL query string, so the page works without JavaScript.
1. AC14: no `sort` param -> "name".
2. AC15: `buildQueryString(q, {city:"Huế"})` keeps `sort`, `stars`, `fac`, etc.
3. AC20: any override other than `pages` resets `pages` to 1 unless `pages` is itself overridden.
4. AC10: `DEFAULT_QUERY` builds to "" (clean `/hotels`).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/query.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export type SortKey = "name" | "price" | "stars";
export interface DirectoryQuery { q: string; city: string; minStars: 0 | 3 | 4 | 5; facilities: string[]; letter: string | null; sort: SortKey; pages: number }
export const DEFAULT_QUERY: DirectoryQuery   // { q:"", city:"", minStars:0, facilities:[], letter:null, sort:"name", pages:1 }
export function parseQuery(params: URLSearchParams): DirectoryQuery
export function buildQueryString(query: DirectoryQuery, overrides?: Partial<DirectoryQuery>): string
```
- `parseQuery` param names: `q` (trim, collapse spaces, max 100 chars), `city` (trim, max 100), `stars` ("3"|"4"|"5" -> number, anything else 0), `fac` (repeatable: `getAll("fac")`, trim, drop empty, drop exact duplicates, keep order, max 20), `letter` (trim, `toUpperCase()`; valid only if exactly one char matching `/^[A-ZĐ#]$/`, else null), `sort` ("name"|"price"|"stars", else "name"), `page` (integer 1..50, else 1; non-integer text -> 1). Missing params -> defaults.
- `buildQueryString(query, overrides = {})`: `m = {...query, ...overrides}`; if `overrides` has any key other than `"pages"` and does NOT have `pages`, set `m.pages = 1`. Output only non-default params in this order: `q`, `city`, `stars` (if minStars != 0), each `fac`, `letter` (if not null), `sort` (if != "name"), `page` (if pages > 1; param name `page`). Build with `new URLSearchParams()` + `append`; result is `"?" + params.toString()` or `""` if no params. Spaces come out as `+`.
- Examples: parseQuery(new URLSearchParams("")) deep-equals DEFAULT_QUERY; parseQuery("q=da%20nang&city=Hu%E1%BA%BF&stars=4&fac=Pool&fac=Parking&fac=Pool&letter=%C4%91&sort=price&page=3") -> {q:"da nang", city:"Huế", minStars:4, facilities:["Pool","Parking"], letter:"Đ", sort:"price", pages:3}; stars=2 -> 0; sort=foo -> "name"; page=0 / page=abc / page=999 -> 1 (999 > 50 -> 1); letter=ab -> null. buildQueryString(DEFAULT_QUERY) -> ""; buildQueryString(DEFAULT_QUERY,{q:"da nang"}) -> "?q=da+nang"; buildQueryString({...DEFAULT_QUERY,sort:"price",pages:3},{city:"Huế"}) -> "?city=Hu%E1%BA%BF&sort=price" (sort kept, pages reset); buildQueryString({...DEFAULT_QUERY,pages:2},{pages:3}) -> "?page=3"; round trip: parseQuery(new URLSearchParams(buildQueryString(x).slice(1))) equals x for a fully filled x.

## Unit tests to write
- [ ] `parseQuery of empty params equals DEFAULT_QUERY (sort name)`: covers AC10, AC14
- [ ] `parseQuery reads and sanitises every param`: covers AC9, AC18, AC19
- [ ] `parseQuery rejects invalid stars/sort/letter/page`: covers AC14, AC19
- [ ] `buildQueryString of defaults is empty string`: covers AC10
- [ ] `changing a filter keeps sort and other filters`: covers AC15
- [ ] `changing a filter or sort resets pages to 1; explicit pages override wins`: covers AC20
- [ ] `build then parse round trip`: covers AC9, AC18, AC19

## Files this task may touch
- `sheet-rag/src/lookup/query.ts`
- `sheet-rag/test/lookup/query.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/query.spec.ts`

## Dev notes

## Review

## Questions
