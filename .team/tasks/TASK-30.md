# TASK-30: Combobox logic without DOM (src/client/bill/combobox.ts)

- id: TASK-30
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-17 (`foldText` in `src/domain/fold.ts`), TASK-6 (test glob `test/client/**`)
- size: fits a 100k-token context (one pure file)

## Why
Technical design 18.5: Hotel and Room are ARIA comboboxes. The browser wiring (TASK-36) is not unit testable without a DOM library (not added: no heavy tooling), so all decisions are made here by pure functions: which options match, how keys move the highlight, what ARIA attributes to set. The wiring then only applies the results. Imports only `src/domain/` (`fold.ts`).

Exports of `sheet-rag/src/client/bill/combobox.ts`:
```ts
export interface Option { value: string; label: string; meta?: string }
export function filterOptions(options: Option[], query: string, limit?: number): Option[];
// foldText on label and query (accents and case ignored); every query token must be contained in the folded label;
// empty query returns the first `limit` (default 50) options in the original order; prefix matches first, then others (stable).
export interface ComboState { open: boolean; active: number }       // active -1 = nothing highlighted
export type ComboEvent = { type: 'input' } | { type: 'focus' } | { type: 'blur' } | { type: 'arrowDown' } | { type: 'arrowUp' }
  | { type: 'home' } | { type: 'end' } | { type: 'enter' } | { type: 'escape' } | { type: 'hover'; index: number } | { type: 'optionsChanged' };
export interface ComboResult { state: ComboState; pick: number | null; preventDefault: boolean }
export function comboStep(state: ComboState, event: ComboEvent, count: number): ComboResult;
export function comboAria(state: ComboState, o: { listId: string; optionId: (i: number) => string; count: number }): Record<string, string>;
// { role:'combobox', 'aria-autocomplete':'list', 'aria-expanded':'true|false', 'aria-controls': listId, 'aria-activedescendant': optionId(active) or '' }
```
Key rules:
- `input` opens the list with `active` -1 (so Enter keeps the typed free text). `focus` does not open. `arrowDown` opens when closed (active 0 if count > 0) and otherwise moves down, wrapping from the last to the first; `arrowUp` wraps up; `home` and `end` jump; all arrow keys set `preventDefault` true when `count > 0`.
- `enter`: if open and `active >= 0` and `active < count`, result `pick = active`, list closes, `preventDefault` true; otherwise `pick` null and `preventDefault` false (the typed text stays as free text).
- `escape`: closes and clears `active` (`preventDefault` true only when it was open). `blur` closes. `optionsChanged` clamps `active` into range (-1 when `count` is 0) and closes when `count` is 0.
- With `count` 0 the list is never reported open by `comboAria` (`aria-expanded` false), so rows with no hotel (free-text room) show no list (AC15).

## Acceptance criteria
1. AC11: `filterOptions` returns hotels containing the typed text and keeps the original order for equal matches; prefix matches come first.
2. AC12: `filterOptions([{label:'Mộng Hotel'}], 'mong')` and `'MONG'` and `'mộng'` all match; `'đà nẵng'` matches `Da Nang` and `Đà Nẵng` options; `'xyz'` gives `[]`.
3. AC14: for room options, typing narrows (`'deluxe'` keeps only labels containing deluxe, accents optional); multiple tokens must all match (`'sea deluxe'`).
4. AC15: `comboAria` with `count` 0 gives `aria-expanded` `false`; `comboStep` with `count` 0 never gives a pick and never reports an active option.
5. AC39: `arrowDown` from closed opens at index 0; repeated down moves and wraps; `arrowUp` wraps to the last; `enter` on an active option picks it and closes; `escape` closes; `enter` with nothing highlighted picks nothing; `home` and `end` work; `aria-activedescendant` follows the active index.
6. AC13: typing (`input`) then `enter` without highlighting gives `pick` null, so the wiring keeps the free text.
7. Regular expression characters in the query (`'(' '[' '*'`) do not throw and match literally (no regex built from user text).

## Unit tests to write
In `test/client/bill-combobox.spec.ts`.
- [ ] `hotel options are found by typed text in order`: covers AC1
- [ ] `accents and case are optional`: covers AC2
- [ ] `room options narrow by all typed words`: covers AC3
- [ ] `no options means no list and no pick`: covers AC4
- [ ] `keyboard moves, wraps, picks and closes`: covers AC5
- [ ] `enter without a highlighted option keeps free text`: covers AC6
- [ ] `special characters in the query are safe`: covers AC7

## Files this task may touch
- `sheet-rag/src/client/bill/combobox.ts` (new)
- `sheet-rag/test/client/bill-combobox.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
