# TASK-7: Sort orders (name, price, stars)

- id: TASK-7
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-1 (imports `compareNames` from `./normalize`)
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC11, AC12, AC13, AC14 (default "name"). AC15 is composed in TASK-21.
1. AC11: name A to Z ignoring diacritics/case (Đ after D), ties by city.
2. AC12: price ascending by "From" price; no valid price last.
3. AC13: stars descending, ties by name A to Z; no stars last.
4. AC14: default order is "name".

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/sort.ts`. Imports only `import { compareNames } from "./normalize";` (`compareNames(a: string, b: string): number`, Đ after D). Exports exactly:
```ts
export type SortOrder = "name" | "price" | "stars";
export const DEFAULT_SORT: SortOrder = "name";
export interface SortableHotel { name: string; city?: string | null; stars?: number | null; fromPrice?: number | null }
export function sortHotels<T extends SortableHotel>(hotels: T[], order: SortOrder = DEFAULT_SORT): T[]
```
- Returns a NEW array; input not mutated; stable (equal elements keep input order; `Array.prototype.sort` on a copy is stable).
- "name": `compareNames(a.name, b.name)`, then `compareNames(a.city ?? "", b.city ?? "")`.
- "price": valid price = finite number `> 0`. Both valid: ascending, ties by name (`compareNames`). Invalid price always after valid; two invalid: by name.
- "stars": valid stars = finite number `>= 1`. Both valid: descending, ties by name. Invalid after valid; two invalid: by name.
- Examples: names ["Zen","Đà Lạt Inn","Dalat","alpha"] with order "name" -> ["alpha","Dalat","Đà Lạt Inn","Zen"]; same name "X" cities "Huế","Đà Nẵng" -> Đà Nẵng first; prices [900,null,500,700] -> [500,700,900,null]; stars [3,null,5,4] -> [5,4,3,null]; stars tie 4 vs 4 names "B","A" -> A then B; default (no order arg) = name.

## Unit tests to write
- [ ] `name order ignores diacritics/case, Đ after D`: covers AC11
- [ ] `name order breaks ties by city`: covers AC11
- [ ] `price order ascending, invalid last`: covers AC12
- [ ] `stars order descending, ties by name, no stars last`: covers AC13
- [ ] `default order is name; DEFAULT_SORT === "name"; input not mutated`: covers AC14

## Files this task may touch
- `sheet-rag/src/lookup/sort.ts`
- `sheet-rag/test/lookup/sort.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/sort.spec.ts`

## Dev notes

## Review

## Questions
