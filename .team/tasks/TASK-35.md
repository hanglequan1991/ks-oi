# TASK-35: Row view model and DOM builder (src/client/bill/viewModel.ts, render.ts)

- id: TASK-35
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-28 (state), TASK-31 (format), TASK-26 (limits), TASK-33 (class contract in `public/bill.css`; read it, do not edit it)
- size: fits a 100k-token context (one pure file, one DOM-only file)

## Why
Splits the screen into a **pure view model** (tested in Node) and a thin **DOM builder** (no DOM library is added, so it is covered by the guard test of TASK-36 and by the Playwright TCs). All user text reaches the DOM only through `textContent`, `value` and attributes set with `setAttribute`; never `innerHTML`, `outerHTML`, `insertAdjacentHTML` (AC10). `src/client/` imports only `src/domain/` and its own folder.

`sheet-rag/src/client/bill/viewModel.ts` (pure):
```ts
export type Labels = Record<string, string>;                       // the `bill` dictionary group, passed in by main.ts
export interface RowView { id: string; index: number; indexText: string;           // '1', '2' ...
  hotelText: string; roomText: string; nightsText: string; priceText: string; totalText: string;   // totalText '—' when no price
  edited: boolean; showReset: boolean; noteText: string; noteEmpty: boolean; canRemove: boolean;
  hotelAria: string; roomAria: string; nightAria: string; priceAria: string; noteAria: string; removeAria: string; roomHasList: boolean }
export interface BillView { rows: RowView[]; grandTotalText: string; canAdd: boolean; addHint: string }   // addHint = addRowLimit text at 30 rows, else ''
export function buildView(state: BillState, labels: Labels, lang: Lang): BillView;
```
Rules: `indexText` is the 1-based position (renumbered after every removal); `roomHasList` is true only when `hotelSlug` is not null (no hotel or free-text hotel: no room list, AC15); `showReset` and `edited` are true when `priceEdited` and `defaultPrice !== null` (AC21; a typed price on a room without a default shows no marker because there is nothing to reset to); ARIA texts use `fillTemplate(labels.hotelAria, {n})`; `noteText` is the raw note (no escaping, the DOM builder uses `textContent`); `noteEmpty` is true for an empty note; the note label itself has no number (Q2: `labels.noteLabel` is used as is).

`sheet-rag/src/client/bill/render.ts` (DOM only, receives `doc: Document` and callbacks, not unit tested):
```ts
export interface RowHandlers { onHotelInput; onHotelKey; onHotelFocus; onRoomInput; onRoomKey; onRoomFocus; onNights; onPrice; onReset; onNote; onRemove }   // each (rowId, event) => void
export function renderRows(doc: Document, host: HTMLElement, view: BillView, labels: Labels, h: RowHandlers): void;   // full rebuild of the structural parts (rows added/removed/cleared/hydrated/picked)
export function patchRow(doc: Document, rowEl: HTMLElement, row: RowView): void;   // update totals, markers, mirrors without replacing focused inputs
export function renderSummary(doc: Document, view: BillView, labels: Labels): void;   // grand total, add button state and hint
export function renderOptions(doc: Document, list: HTMLElement, options: { value: string; label: string; meta?: string }[], activeIndex: number, idFor: (i: number) => string): void;
```
DOM shape per row (class names from TASK-33): `.bill-item` > `.bill-row` (cells with `.cell-label`; `.c-index` number; `.c-hotel` and `.c-room` each a `.combo` with an `input` (`role=combobox` attributes added by wiring) and a `.combo-list` `ul` with `role=listbox`; `.c-night` input `inputmode="numeric"`; `.c-price` input `inputmode="numeric"`, `.badge-edited` and `.btn-reset` when `showReset`; `.c-total` text; `.c-remove` button with `aria-label`, `disabled` when `canRemove` is false) and `.bill-note` (`.note-label` with `labels.noteLabel` only, `.note-field` `textarea` with `maxlength="500"`; `.is-empty` class when empty). Every input and textarea has an adjacent `.print-only` mirror span whose `textContent` is the value; the note mirror keeps line breaks (CSS `pre-wrap`). Each control gets its `aria-label` from the view. No `style` attribute is ever set.

## Acceptance criteria
1. AC7 / AC26 / AC28: for a state with 3 rows `indexText` is `1`,`2`,`3`; after removing the middle row the view gives `1`,`2`.
2. AC8 / Q2: `noteAria` is the labelled text for screen readers (with row number, e.g. `Note, row 2`), while the visible label text used by `render.ts` is exactly `labels.noteLabel` (`NOTE` / `GHI CHÚ`) with no number; the view model exposes no row number for the visible note label (a test checks the `RowView` has no field named `noteLabel` containing a digit).
3. AC10: a note `<script>alert(1)</script>` and a hotel text with `"` and `&` are returned unchanged in the view; a source scan of `render.ts` and `viewModel.ts` finds none of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`.
4. AC15: `roomHasList` false for a row with no hotel and for a free-text hotel; true for a picked hotel.
5. AC18: a row with no price has `totalText` `—`; with 2 nights and price 1,375,000 it is `2.750.000` (vi) or `2,750,000` (en).
6. AC21 / AC22: `edited` and `showReset` true only for an edited price on a room with a default; after reset both false.
7. AC25: `grandTotalText` equals the sum of all row totals formatted (null counts 0).
8. AC27 / AC29: `canAdd` false and `addHint` set at 30 rows; `canRemove` false for the only row.
9. AC37: `noteEmpty` true when the note is empty, false for text; (the DOM builder marks the note row `.is-empty`, checked by TC).
10. AC38 / AC36 (structure, by TC): `render.ts` only uses class names defined in the contract of TASK-33 (a test reads both files and checks every `classList`/`className` literal in `render.ts` exists in `public/bill.css`).

## Unit tests to write
In `test/client/bill-viewmodel.spec.ts`.
- [ ] `rows are numbered in order and renumbered after removal`: covers AC1
- [ ] `visible note label has no row number but aria text has`: covers AC2
- [ ] `user text is passed through unchanged and render code never uses html injection`: covers AC3
- [ ] `room list only for a picked hotel`: covers AC4
- [ ] `total text shows a dash without a price and grouped numbers with one`: covers AC5
- [ ] `edited marker and reset only for an edited price on a room with a default`: covers AC6
- [ ] `grand total sums the rows`: covers AC7
- [ ] `add and remove availability`: covers AC8
- [ ] `empty note is flagged`: covers AC9
- [ ] `render.ts uses only classes defined in bill.css`: covers AC10

## Files this task may touch
- `sheet-rag/src/client/bill/viewModel.ts` (new)
- `sheet-rag/src/client/bill/render.ts` (new)
- `sheet-rag/test/client/bill-viewmodel.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
