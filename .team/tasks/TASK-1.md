# TASK-1: Text normalize and match (accent-insensitive, Đ-aware)

- id: TASK-1
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC1, AC2, AC3 (also provides the name ordering used by AC11, AC4, AC16 via `compareNames`).
1. AC1: "da nang" (any case, no diacritics) matches "Đà Nẵng Beach Hotel" and area "Đà Nẵng"; "Đà Nẵng" matches the same.
2. AC2: matches by substring against any of the given fields (name, area); leading/trailing/repeated spaces ignored; empty (or all-space) query matches everything.
3. AC3: "d" matches both "đ" and "Đ"; "dong" finds "Đông".

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/normalize.ts`. Pure TypeScript, no imports, no I/O. Exports exactly:
```ts
export function normalizeText(input: string): string
export function sortKey(input: string): string
export function compareNames(a: string, b: string): number
export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean
```
- `normalizeText`: `input.toLowerCase()`, then replace every "đ" with "d", then `.normalize("NFD")` and remove `/[̀-ͯ]/g`, then collapse whitespace runs (`/\s+/g`) to one space, then trim. Examples: "Đà Nẵng" -> "da nang"; "  DA   nang " -> "da nang"; "Đông" -> "dong"; "" -> "".
- `sortKey`: same as `normalizeText` EXCEPT "đ" becomes "d{" (the "{" char sorts after "z", so Đ-words sort after all D-words). Example: sortKey("Đông") = "d{ong"; sortKey("Dalat") = "dalat".
- `compareNames(a,b)`: compare `sortKey(a)` and `sortKey(b)` with `<` / `>` (NOT localeCompare); return -1, 1 or 0. Examples: compareNames("Dalat","Đà Nẵng") < 0; compareNames("Đà Nẵng","Eden") < 0; compareNames("Hà Nội","ha noi") === 0.
- `matchesQuery(query, fields)`: `nq = normalizeText(query)`; if `nq === ""` return true; else true when any non-null field has `normalizeText(field).includes(nq)`. Null/undefined fields are skipped. Examples: matchesQuery("da nang", ["Đà Nẵng Beach Hotel", null]) = true; matchesQuery("  DA  nang", ["x","Đà Nẵng"]) = true; matchesQuery("", []) = true; matchesQuery("hue", ["Đà Nẵng"]) = false; matchesQuery("d", ["Đ"]) = true; matchesQuery("dong", ["Hotel Đông"]) = true.
- Edge cases: input that is already NFD-decomposed gives the same result as precomposed.

## Unit tests to write
- [ ] `normalizeText strips diacritics, case and extra spaces`: covers AC1, AC2
- [ ] `normalizeText maps đ and Đ to d`: covers AC3
- [ ] `matchesQuery finds Đà Nẵng by "da nang" in name or area`: covers AC1
- [ ] `matchesQuery treats empty and space-only query as match-all`: covers AC2
- [ ] `matchesQuery substring and no-match`: covers AC2
- [ ] `matchesQuery d matches đ/Đ and dong finds Đông`: covers AC3
- [ ] `compareNames puts Đ after D and before E, ignores case/diacritics`: supports AC11, AC16

## Files this task may touch
- `sheet-rag/src/lookup/normalize.ts`
- `sheet-rag/test/lookup/normalize.spec.ts`

Test command (config.md still TODO; fill before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/normalize.spec.ts`

## Dev notes

## Review

## Questions
