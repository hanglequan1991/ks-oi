# TASK-5: Distinct cities and facilities (select, tabs, chips)

- id: TASK-5
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-1 (imports `compareNames` from `./normalize`)
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC4 (city list), AC6 (facility chip list), AC9 (tabs = All + one per city).
1. AC4/AC9: each distinct city once, accent-aware, sorted A to Z (Đ after D); empty values dropped. The "All cities"/"All" entry is added by the view, not here.
2. AC6: facility chips list = each distinct facility present in the data once, sorted A to Z.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/options.ts`. Imports only `import { compareNames } from "./normalize";` (exists after TASK-1: `compareNames(a: string, b: string): number`). Exports exactly:
```ts
export function distinctCities(cities: Array<string | null | undefined>): string[]
export function distinctFacilities(lists: Array<Array<string | null | undefined> | null | undefined>): string[]
```
- Shared private helper: trim each value, skip null/undefined/empty. Duplicate key = `value.replace(/\s+/g, " ").normalize("NFC").toLowerCase()` (accent-AWARE: "Hà Nội" and "Ha Noi" are different). Keep the first occurrence's trimmed spelling (whitespace collapsed to single spaces). Sort result with `compareNames`.
- `distinctFacilities` flattens the lists first (null list = skipped), then same helper.
- Examples: distinctCities(["Hà Nội","Đà Nẵng","Hà Nội"," hà  nội ","Huế","",null]) -> ["Đà Nẵng","Hà Nội","Huế"]; distinctCities([]) -> []; distinctFacilities([["Pool","Parking"],["pool"],null,["Breakfast"]]) -> ["Breakfast","Parking","Pool"].

## Unit tests to write
- [ ] `distinctCities dedupes, trims, drops empty`: covers AC4
- [ ] `distinctCities sorts A to Z with Đ after D`: covers AC4, AC9
- [ ] `distinctCities is accent-aware (Hà Nội vs Ha Noi stay separate)`: covers AC4
- [ ] `distinctFacilities flattens, dedupes case-insensitively, sorts`: covers AC6

## Files this task may touch
- `sheet-rag/src/lookup/options.ts`
- `sheet-rag/test/lookup/options.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/options.spec.ts`

## Dev notes

## Review

## Questions
