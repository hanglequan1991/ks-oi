# TASK-33: Billing page styles incl. mobile cards and print (public/bill.css)

- id: TASK-33
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-6 (test glob `test/client/**`). No file overlap with TASK-9: `public/app.css` is owned by TASK-9 and is not touched; the billing page loads this separate `/bill.css` after `/app.css` (design 18.11 names `public/bill.css` as the home of the print rules).
- size: fits a 100k-token context (one CSS file and a text-based test)

## Why
Approved mockup (design 18.2 and 18.8). This task fixes the **class names** that the page (TASK-37) and the DOM builder (TASK-35) must use; the contract below is the only place it is defined. No `@import`, no external fonts or URLs, no use of inline styles by the page (CSP forbids them), so every visual state is a class or an attribute selector. The test reads the CSS text (no browser); the real rendering is checked by the Playwright TCs.

Class contract (a dev of TASK-35 / TASK-37 uses exactly these):
- `.bill-page` page wrapper; `.bill-noscript` message block (visible without JavaScript only through the `<noscript>` element, no rule needed beyond spacing).
- `.bill-grid` list container; `.bill-head` header row (hidden below 720 px); `.bill-item` wraps one data row plus its note (kept together in print); `.bill-row` the data row; `.bill-note` the note row.
- Cells inside `.bill-row`: `.c-index`, `.c-hotel`, `.c-room`, `.c-night`, `.c-price`, `.c-total`, `.c-remove`. `.cell-label` small label shown only below 720 px. Inside the note row: `.note-label` (first column) and `.note-field` (columns 2 to 6). `.bill-note.is-empty` marks a note with no text.
- Controls: `.combo` wrapper, `.combo-list` listbox, `.combo-option` (`[aria-selected="true"]` highlighted), `.badge-edited` marker, `.btn-reset` (use default price), `.btn`, `.btn-primary`, `.btn-danger`, `.bill-actions` (add, clear, print, clear draft), `.bill-status` (draft saved message), `.bill-summary` (grand total), `.bill-notes` (fee note and disclaimer block), `.bill-print-head` (title and date; hidden on screen).
- Visibility helpers: `.no-print` (hidden in print), `.print-only` (hidden on screen, shown in print; `white-space: pre-wrap`).

Required rules:
- Desktop: `.bill-head, .bill-row` use `display: grid; grid-template-columns: 56px 2fr 2fr 110px 170px 170px 52px; gap: 12px`. `.bill-note` uses the same template; `.note-label` is `grid-column: 1`, `.note-field` is `grid-column: 2 / 7`.
- Mobile `@media (max-width: 720px)`: `.bill-head` hidden; each `.bill-item` is a card (border, padding); `.bill-row` becomes a flex or grid layout with number and remove on the first line, Hotel and Room full width, Night and Pricing side by side, Total full width; `.cell-label` visible; `.bill-note` is one column; every interactive control (`input, textarea, .btn, .btn-reset, .c-remove button`) has `min-height: 44px`.
- `@media print`: `@page { size: A4; margin: 14mm }`; `header, footer, .no-print, input, textarea, .combo-list, .btn, .btn-reset, .badge-edited, .c-remove, .bill-status { display: none !important }`; `.print-only { display: block !important }`; `.bill-print-head { display: block }`; `.bill-item { break-inside: avoid }`; `.bill-note.is-empty { display: none }`; the grid keeps the desktop template in print even when the window is narrow (print rules come last and reset the mobile card layout).

## Acceptance criteria
1. AC8: the CSS has the template `56px 2fr 2fr 110px 170px 170px 52px` for `.bill-head` and `.bill-row`, the same template for `.bill-note`, and `.note-field` placed `grid-column: 2 / 7`, `.note-label` in column 1.
2. AC38: an `@media (max-width: 720px)` block hides `.bill-head`, shows `.cell-label`, and sets `min-height: 44px` for the listed controls.
3. AC36: an `@media print` block contains `@page` with A4, hides `header`, `footer`, `.no-print`, `input`, `textarea` and shows `.print-only` and `.bill-print-head`; `.bill-item` has `break-inside: avoid`.
4. AC37: the print block hides `.bill-note.is-empty`.
5. AC36 / AC21: `.badge-edited`, `.btn-reset` and `.bill-status` are hidden in print; `.print-only` and `.bill-print-head` are hidden on screen (outside the print block).
6. CSP and offline safety: the file has no `@import`, no `url(` pointing to `http`, no `expression(`, and every class named in the contract appears at least once.

## Unit tests to write
In `test/client/bill-css.spec.ts` (reads `public/bill.css` as text; normalises whitespace before matching).
- [ ] `desktop grid template and note alignment`: covers AC1
- [ ] `mobile card rules and 44 px targets`: covers AC2
- [ ] `print rules hide controls and show mirrors and print head`: covers AC3
- [ ] `empty notes are hidden in print`: covers AC4
- [ ] `screen hides print-only parts and print hides edit helpers`: covers AC5
- [ ] `no imports or external urls and all contract classes exist`: covers AC6

## Files this task may touch
- `sheet-rag/public/bill.css` (new)
- `sheet-rag/test/client/bill-css.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
Verdict: **approve**

- Tests: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` in sheet-rag: 19 files, 111 tests pass, including all 6 tests in `test/client/bill-css.spec.ts` (one per AC1-6, parsing the CSS blocks, not trivial string checks).
- Class contract: every listed class appears; `[aria-selected="true"]` rule present.
- Desktop: template `56px 2fr 2fr 110px 170px 170px 52px` on `.bill-head`, `.bill-row`, `.bill-note`; `.note-label` col 1, `.note-field` `2 / 7`, so the note box spans Hotel..Total.
- Mobile (max-width 720px): head hidden, card border/padding, 2-col grid (index + remove, hotel/room/total full width, night + price side by side), `.cell-label` shown, note one column, `min-height: 44px` on input, textarea, .btn, .btn-reset, `.c-remove button`.
- Print (last in file): `@page` A4 14mm, hide list with `!important`, `.print-only` block, print head block, `.bill-item` break-inside avoid, empty notes hidden, desktop template restored for head, row and note, with `.note-field` `2 / 7`.
- No `@import`, no external `url(`, no `expression(`. Only the two allowed files changed.
- Non-blocking nits (no rework): dev left no Dev notes; on a narrow print window the mobile `text-align: left` on `.c-index`/`.c-night`/`.c-price`/`.c-total` is not reset in the print block, so numbers may be left-aligned there (cosmetic).

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
