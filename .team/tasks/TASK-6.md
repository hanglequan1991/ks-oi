# TASK-6: Filter composition (query, city, stars, facilities; AND)

- id: TASK-6
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-1 (imports `matchesQuery` from `./normalize`)
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC2 (query over name + area), AC4 (choosing a city shows only that city), AC5, AC6, AC7, AC8, AC9 (tab = city restriction, same function), AC10 (cleared criteria -> all).
1. AC5: minStars 0 (Any) = all; 3 = >=3; 4 = >=4; 5 = exactly 5; a hotel with no stars only for Any.
2. AC6/AC7: selected facilities -> hotel must have ALL of them.
3. AC8: query AND city AND stars AND facilities.
4. AC10: default criteria (query "", city "", minStars 0, facilities []) returns every hotel.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/filter.ts`. Imports only `import { matchesQuery } from "./normalize";` (`matchesQuery(query: string, fields: Array<string|null|undefined>): boolean`, accent-insensitive, empty query = true). Exports exactly:
```ts
export interface FilterableHotel { name: string; area?: string | null; city?: string | null; stars?: number | null; facilities?: string[] | null }
export interface FilterCriteria { query: string; city: string; minStars: 0 | 3 | 4 | 5; facilities: string[] }
export function filterHotels<T extends FilterableHotel>(hotels: T[], c: FilterCriteria): T[]
```
- Returns a NEW array with the original order preserved; does not mutate.
- Query: `matchesQuery(c.query, [h.name, h.area])`.
- City: `c.city` empty (after trim) = no restriction; otherwise hotel city must equal it using canon key `s.trim().replace(/\s+/g," ").normalize("NFC").toLowerCase()` (accent-aware equality; hotel with null/empty city fails).
- Stars: `minStars === 0` -> no restriction. Hotel stars null/undefined/non-finite -> excluded when minStars > 0. `minStars === 5` -> `stars === 5`; `3`/`4` -> `stars >= minStars`.
- Facilities: every selected facility (canon key as above) must be in the hotel's facilities (canon keys). Empty selection = no restriction. Null hotel facilities = empty list.
- Examples: hotels A{name:"Đà Nẵng Beach Hotel",city:"Đà Nẵng",stars:5,facilities:["Pool","Parking"]}, B{name:"Hue Palace",area:"Huế",city:"Huế",stars:3,facilities:["Pool"]}, C{name:"No Star",city:"Huế",stars:null}. Query "da nang" -> [A]; minStars 4 -> [A]; minStars 3 -> [A,B]; minStars 5 -> [A]; minStars 0 -> [A,B,C]; facilities ["pool"] -> [A,B]; facilities ["pool","parking"] -> [A]; city "huế" -> [B,C]; city "Hue" -> [] (accent-aware); all of {city:"Huế",minStars:3,facilities:["Pool"]} -> [B]; default criteria -> [A,B,C].

## Unit tests to write
- [ ] `query matches name or area accent-insensitively`: covers AC2
- [ ] `city restricts to that city (accent-aware, case-insensitive)`: covers AC4, AC9
- [ ] `minStars Any/3+/4+/5 and no-star hotel only for Any`: covers AC5
- [ ] `single facility filter`: covers AC6
- [ ] `several facilities require all`: covers AC7
- [ ] `all criteria combine with AND`: covers AC8
- [ ] `default criteria return all, input not mutated, order kept`: covers AC10

## Files this task may touch
- `sheet-rag/src/lookup/filter.ts`
- `sheet-rag/test/lookup/filter.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/filter.spec.ts`

## Dev notes

## Review

## Questions
