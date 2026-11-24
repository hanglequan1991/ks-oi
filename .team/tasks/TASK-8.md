# TASK-8: A-to-Z letter grouping

- id: TASK-8
- story: [STORY-11](../stories/STORY-11.md)
- type: backend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: none
- size: fits a 100k-token context (one pure module)

## Acceptance criteria
Covers STORY-11: AC16, AC17 (counts/enabled), AC18 (letter restriction).
1. AC16: group by first letter of name with diacritics removed; Đ is its own group after D; digit/symbol names go to "#".
2. AC17: counts per letter (0 = disabled); the caller passes the already filtered names so counts reflect current filters.
3. AC18: selecting a letter keeps only that group; null/"" (or "All") removes the restriction.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/browse.ts`. Pure TypeScript, no imports. Exports exactly:
```ts
export const LETTERS: readonly string[]   // ["A","B","C","D","Đ","E","F",...,"Z","#"]  (27 letters + "#" = 28 entries; Đ right after D; "#" last)
export function letterOf(name: string): string
export function letterCounts(names: string[]): Record<string, number>
export function isLetterEnabled(counts: Record<string, number>, letter: string): boolean
export function filterByLetter<T extends { name: string }>(hotels: T[], letter: string | null): T[]
```
- `letterOf`: `c = name.trim()[0]`; none -> "#". If `c` is "Đ" or "đ" -> "Đ". Else `c.normalize("NFD")`, strip `/[̀-ͯ]/g`, `toUpperCase()`, take first char; if it matches `/^[A-Z]$/` return it, else "#". Examples: "Đà Nẵng Beach"->"Đ"; "đông"->"Đ"; "Ân Hotel"->"A"; "Ếch"->"E"; "dalat"->"D"; "  Sunrise"->"S"; "1 Hotel"->"#"; "@Home"->"#"; ""->"#"; "   "->"#".
- `letterCounts`: object with EVERY entry of `LETTERS` as key (0 when none), value = number of names whose `letterOf` is that letter.
- `isLetterEnabled`: `(counts[letter] ?? 0) > 0`.
- `filterByLetter`: `letter` null/undefined/"" -> returns a copy of all; else hotels with `letterOf(h.name) === letter`; order kept; input not mutated.
- Example: letterCounts(["Dalat","Đà Nẵng","Hue","1 Star"]) -> D:1, Đ:1, H:1, "#":1, all others 0.

## Unit tests to write
- [ ] `LETTERS has Đ right after D and # last`: covers AC16
- [ ] `letterOf strips diacritics, Đ own letter, digit/symbol/empty -> #`: covers AC16
- [ ] `letterCounts has every letter key with correct counts`: covers AC16, AC17
- [ ] `isLetterEnabled false for zero-count letters`: covers AC17
- [ ] `filterByLetter keeps only group; null/"" returns all; order kept`: covers AC18

## Files this task may touch
- `sheet-rag/src/lookup/browse.ts`
- `sheet-rag/test/lookup/browse.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/browse.spec.ts`

## Dev notes

## Review

## Questions
