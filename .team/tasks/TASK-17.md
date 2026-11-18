# TASK-17: Accent folding and safe LIKE patterns (src/domain/fold.ts)

- id: TASK-17
- story: [STORY-15](../stories/STORY-15.md)
- type: backend        <!-- frontend | backend -->
- status: review
- assignee: dev
- rework count: 0
- depends on: TASK-1 (test runner only; no file overlap with other STORY-15 tasks)
- size: fits a 100k-token context (few files, one behaviour)

## Why
AC2, AC12 and AC13 need accent-insensitive matching. The stored `name_search` column holds the folded name (lower case, no diacritics, `đ` as `d`; technical-design.html section 5). The sync story (STORY-14) will use the same function to fill the column, so the rule lives in `src/domain/` (imports nothing outside it). FTS5 is not in the schema (TASK-2), so search uses `LIKE` with bound parameters; this file builds those patterns safely.

Required exports in `sheet-rag/src/domain/fold.ts`:
```ts
export function foldText(input: string): string;
// lower case, NFD then strip combining marks, đ/Đ -> d, every character that is not a-z or 0-9 becomes a space,
// runs of spaces collapsed, trimmed. Never throws; non-string input is not accepted (typed string).
export function searchTokens(input: string, max?: number): string[];   // foldText split on space, empty removed, first `max` (default 6)
export function likePrefixPattern(folded: string): string;   // `${escaped}%` where %, _ and the escape character \ are escaped with \  (query must use ESCAPE '\')
export function likeContainsPattern(token: string): string;  // `%${escaped}%`
```
Because `foldText` leaves only `a-z`, `0-9` and spaces, the escape step is defence in depth; it must still be tested on raw input.

## Acceptance criteria
1. AC2 / AC12: `foldText('Mộng Hotel')` is `mong hotel`; `foldText('Đà Nẵng')` is `da nang`; `foldText('  ĐÔNG   đô ')` is `dong do`; mixed case and already-folded text give the same result.
2. AC13: `foldText('a%b_c"d*e(f)\\g\'h;--')` contains none of `% _ " * ( ) \ ' ;` and `-`; text with only symbols gives the empty string; an emoji or a control character is turned into a space.
3. AC2: `searchTokens('  Mộng   Hotel ')` is `['mong','hotel']`; more than 6 words are cut to the first 6; empty input gives `[]`.
4. AC13: `likePrefixPattern('mo%ng')` is `mo\%ng%`; `_` and `\` are escaped; `likeContainsPattern('mong')` is `%mong%`; a pattern built from a string with `%` never contains an unescaped `%` except the leading and trailing wildcards.

## Unit tests to write
In `test/domain/fold.spec.ts`.
- [ ] `foldText removes accents, maps d with stroke and normalises spaces`: covers AC1
- [ ] `foldText strips search-syntax and control characters`: covers AC2
- [ ] `searchTokens splits, drops empties and caps at 6`: covers AC3
- [ ] `like patterns escape percent, underscore and backslash`: covers AC4

## Files this task may touch
- `sheet-rag/src/domain/fold.ts` (new)
- `sheet-rag/test/domain/fold.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Added `sheet-rag/src/domain/fold.ts` (foldText, searchTokens, likePrefixPattern, likeContainsPattern) and `sheet-rag/test/domain/fold.spec.ts` (4 tests, all pass).
- Red confirmed first (module missing), then green.
- Full unit run: 18 tests pass; `test/web/smoke.spec.tsx` fails on `Cannot find package 'react/jsx-dev-runtime'`. It is not part of TASK-17 and was not touched.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
