# TASK-11: Building info items (present items only)

- id: TASK-11
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC34 (logic part; labels/units text are rendered in TASK-29 using TASK-18 strings).
1. AC34: each present item (floors, number of rooms, year built, distance to beach) is returned with its display value; missing/invalid items are omitted; all missing -> empty list (section hidden).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/building.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export interface BuildingInfo { floors?: number | null; roomCount?: number | null; yearBuilt?: number | null; beachDistanceM?: number | null }
export type BuildingKey = "floors" | "roomCount" | "yearBuilt" | "beachDistance";
export interface BuildingItem { key: BuildingKey; display: string }
export function buildingItems(info: BuildingInfo | null | undefined): BuildingItem[]
```
- Output order is always: floors, roomCount, yearBuilt, beachDistance (only present ones).
- Validity: `floors` and `roomCount`: finite integer `>= 1`. `yearBuilt`: finite integer 1800..2100. `beachDistanceM`: finite number `>= 0`. Anything else (null, undefined, NaN, strings, out of range) is omitted.
- `display`: floors/roomCount/yearBuilt -> `String(value)` with no unit (the renderer adds the translated unit word, e.g. "12" + "floors"). beachDistance: `< 1000` -> `` `${Math.round(m)} m` ``; `>= 1000` -> `` `${Math.round(m / 100) / 10} km` ``.
- Examples: {floors:12} -> [{key:"floors",display:"12"}]; {} / null / undefined -> []; {floors:0, roomCount:-1, yearBuilt:1500, beachDistanceM:null} -> []; {beachDistanceM:350} -> display "350 m"; {beachDistanceM:0} -> "0 m"; {beachDistanceM:1250} -> "1.3 km"; {beachDistanceM:2000} -> "2 km"; all four {floors:10, roomCount:120, yearBuilt:2015, beachDistanceM:200} -> 4 items in the order above.

## Unit tests to write
- [ ] `returns only present valid items in fixed order`: covers AC34
- [ ] `returns empty list when all empty, null or invalid`: covers AC34
- [ ] `beach distance shows m below 1000 and km above`: covers AC34
- [ ] `rejects out-of-range year and non-integer floors/rooms`: covers AC34

## Files this task may touch
- `sheet-rag/src/lookup/building.ts`
- `sheet-rag/test/lookup/building.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/building.spec.ts`

## Dev notes

## Review

## Questions
