# TASK-12: "More hotels in this city"

- id: TASK-12
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC36 (selection logic).
1. AC36: other hotels of the same city, never the current hotel, at most 4; empty list when none (section hidden).

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/related.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export const RELATED_LIMIT = 4;
export function moreInCity<T extends { id: string; city?: string | null }>(hotels: T[], current: { id: string; city?: string | null }, max: number = RELATED_LIMIT): T[]
```
- City key = `s.trim().replace(/\s+/g," ").normalize("NFC").toLowerCase()`. If the current hotel's city key is empty -> `[]`.
- Keep hotels whose city key equals the current's and whose `id !== current.id`; keep input order (caller pre-sorts); take the first `max` (invalid/negative `max` -> 4). Returns a new array.
- Examples: current {id:"1",city:"Huế"}; hotels ids 1(Huế),2(Huế),3(Đà Nẵng),4(huế) -> ids [2,4]; 6 other hotels in Huế -> first 4 in input order; only itself -> []; current city null -> []; city "Hue" does not match "Huế".

## Unit tests to write
- [ ] `returns same-city hotels excluding the current one`: covers AC36
- [ ] `limits to 4 and keeps input order`: covers AC36
- [ ] `returns empty when none or current city empty`: covers AC36

## Files this task may touch
- `sheet-rag/src/lookup/related.ts`
- `sheet-rag/test/lookup/related.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/related.spec.ts`

## Dev notes

## Review

## Questions
