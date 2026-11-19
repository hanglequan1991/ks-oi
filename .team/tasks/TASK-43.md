# TASK-43: Billing page restyle to the approved design (CSS only, `public/bill.css`)

- id: TASK-43
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-33, TASK-35, TASK-36, TASK-37 (all done)
- size: fits a 100k-token context (2 files: one CSS file rewrite, one test file extended)

## Why
The user approved a design on the canvas (desktop, mobile, print). The live page differs: colours, spacing, card, buttons, dropdown, mobile card order, print layout. This task rewrites only `sheet-rag/public/bill.css`. The markup hooks it needs (new classes, `is-edited` flag, header, footer row, language toggle, reset text) are added by TASK-44, which depends on this task. CSS for classes that do not exist in the markup yet is harmless. Do not deploy between the two tasks (the page is only fully correct after both).

Design source (read-only, do not copy into the repo): `/tmp/claude-0/-home-user-ks-oi/a0506c9d-4338-5493-bc9f-2b59bc791178/scratchpad/billing-design/project/Main.dc.html`, `Mobile.dc.html`, `Print.dc.html`. The numbers below are taken from them.

## Decisions (lead)
- **Font: system stack, no Inter.** The CSP is `default-src 'none'; style-src 'self'; font-src 'self'`, so a Google Fonts `<link>` or `@import` would be blocked. The page keeps the system stack already set in `app.css`; bill.css must not name Inter and must not load any font or external URL.
- **bill.css is loaded only on the bill page**, so it may override page-level base styles (`body`, `main`) without touching `app.css` (shared; not in this task).
- **Do not change the class-name contract**: every class already in the contract list of `bill-css.spec.ts` stays defined. New classes are added (list below). Contract tests are updated deliberately where the design changes a value (grid template, mobile row display).
- **Dropdown hint** (`Không có trong danh sách? Cứ nhập tên khách sạn.`) is rendered with CSS `content: attr(data-hint)` on `.combo-list[data-hint]::after`, so the listbox keeps only `li role="option"` children (keyboard and aria behaviour unchanged). TASK-44 sets the `data-hint` attribute on the hotel list. The hint shows only while the list is open with at least one option (existing behaviour of `list.hidden`).
- **Mobile card order** uses `display: contents` on `.bill-row` and `.bill-note` inside `.bill-item` (a 2-column grid `96px minmax(0,1fr)`) plus `order`, so the edited markers can sit between Pricing and "Thành tiền" even though they live in the note block.

## Class contract (new classes TASK-44 will emit; define them here)
`bill-header`, `bill-titlebox`, `bill-intro`, `bill-tools` (status + language toggle, right of the title), `lang-toggle`, `lang-current`, `lang-link`, `bill-card` (wraps grid and footer row), `bill-foot` (footer row inside the card: actions left, total right), `summary-label`, `summary-total`, `bill-bottom` (notes left, print/clear-draft buttons right), `bill-tools-actions`, `btn-outline`, `row-title`, `note-markers`, and the state class `is-edited` on `.bill-item`.
Existing classes keep their meaning. `.bill-summary` now wraps `.summary-label` and `.summary-total`.

## Acceptance criteria
1. AC1 (tokens): bill.css uses page background `#F4F6F8`, ink `#14202B`, muted `#52606D`, accent `#0F766E` (hover `#115E59`), input border `#C9D2DB`, card border `#DCE3EA`; no `Inter`, no `@import`, no external `url()`; `body`/`main` overridden for this page (`main` max-width 1280px, no extra padding; `.bill-page` padding 40px 48px 48px).
2. AC2 (grid): `.bill-head`, `.bill-row`, `.bill-note` and `.bill-foot` all use `grid-template-columns: 56px minmax(0,1.5fr) minmax(0,1.3fr) 96px 180px 170px 44px` with `column-gap: 12px`; header cells are uppercase, 13px, weight 600, letter-spacing 0.04em, muted, with a bottom border `#DCE3EA`.
3. AC3 (card and fields): `.bill-card` is white with `1px solid #DCE3EA`, radius 12px, padding 24px. `.bill-page input` and `.bill-page textarea` have border `1px solid #C9D2DB`, radius 8px, padding 0 12px, font-size 15px; inputs are 44px high, the textarea has `min-height: 44px` and a `#FBFCFD` background. Focus shows a 2px `#0F766E` border with a `0 0 0 3px #CCE9E6` ring. Price and Night inputs right-aligned, `font-variant-numeric: tabular-nums`; the row total is 16px weight 600, right-aligned.
4. AC4 (edited price): `.bill-item.is-edited .c-price input` has `border: 2px solid #B45309`. `.badge-edited` is `#FEF3C7` background, `#92400E` text, 12px weight 600, padding 4px 8px, radius 6px. `.btn-reset` looks like a link (no border or background, accent colour, 13px weight 500, underline on hover, hover `#115E59`). `.note-markers` spans `grid-column: 5 / 7` and is a wrapping flex row with gap 8px.
5. AC5 (note): `.note-label` is 12px, bold (600 or 700), letter-spacing 0.06em, muted, in column 1 with 14px top padding. `.note-field` spans `2 / 7`; inside `.bill-item.is-edited` it spans `2 / 5`.
6. AC6 (footer and grand total): `.bill-foot` is a grid with the same template; `.bill-actions` spans columns 1 to 4; `.bill-summary` is `display: contents`; `.summary-label` is in column 5 (14px, 600, muted, right-aligned); `.summary-total` is in column 6 (24px, 700, right-aligned, tabular numbers).
7. AC7 (buttons): `.btn` min-height 44px, padding 0 18px, radius 8px, border `1px solid #C9D2DB`, white background, ink text, weight 500. `.btn-primary` is solid `#0F766E` with white text, hover `#115E59`. `.btn-outline` is white with `#0F766E` border and text, weight 600. `.bill-tools-actions` and `.bill-actions` are wrapping flex rows with gap 12px. Disabled buttons look disabled (opacity and `not-allowed` cursor).
8. AC8 (header): `.bill-header` is a wrapping flex row, `space-between`, `align-items: flex-end`; the page `h1` is 28px, weight 700, line-height 1.2; `.bill-intro` 15px muted; `.bill-status` 14px muted; `.lang-toggle` is an inline-flex segmented control (border `1px solid #C9D2DB`, radius 8px, overflow hidden, white); `.lang-current` has `#0F766E` background and white text; `.lang-link` ink text, no underline; both 14px weight 600 with padding 10px 14px.
9. AC9 (dropdown): `.combo-list` is white with `1px solid #C9D2DB`, radius 8px, `box-shadow: 0 8px 24px rgba(20,32,43,0.14)`, `top: calc(100% + 4px)`, overflow hidden or scrolling, max-height 240px. `.combo-option` padding 12px, 15px. The option with `aria-selected="true"` has background `#E6F4F2` and weight 600. `.combo-option [data-field="meta"]` is muted and right-aligned. `.combo-list[data-hint]::after` shows `content: attr(data-hint)`, 13px muted, padding 12px, `border-top: 1px solid #EEF2F5`.
10. AC10 (mobile, max-width 720px): `.bill-head` hidden; `.bill-card` has no background, border or padding; each `.bill-item` is a white card (`1px solid #DCE3EA`, radius 12px, padding 16px, margin-bottom 16px) and a grid `96px minmax(0,1fr)` with gap 12px; `.bill-row` and `.bill-note` are `display: contents`. Order inside the card: `.c-index` (order 1, shows `.row-title` "Dòng n" bold 15px; `.c-index .cell-label` and `.c-index [data-field="index"]` hidden), `.c-remove` (order 2, right-aligned, 44px square), `.c-hotel` and `.c-room` (orders 3 and 4, full width), `.c-night` (5, column 1) and `.c-price` (6, column 2, side by side), `.note-markers` (7, full width, right-aligned), `.c-total` (8, full width, flex row with the "Thành tiền" label left in 13px muted and the value right in 18px weight 700), `.note-label` and `.note-field` (9 and 10, full width). `.cell-label` is 12px, 600, uppercase, letter-spacing 0.04em, muted. All of `input`, `textarea`, `.btn`, `.btn-reset`, `.c-remove button`, `.lang-link`, `.lang-current` have `min-height: 44px` (`.lang-*` also `min-width: 44px`). `.bill-foot` becomes a flex column: `.bill-actions` first (each button `flex: 1 1 0`), then `.bill-summary` as a dark bar (`#14202B` background, white text, radius 12px, padding 16px, flex row, label 14px 600 left, total 24px 700 right). `.bill-bottom` stacks; the print button is full width, min-height 48px. `.bill-page` padding is 20px 16px 24px and the `h1` is 22px.
11. AC11 (print, black and white): `@page` stays A4 with 14mm margin. In print the body is `#FFFFFF` with `#111111` text; `.bill-header`, `.bill-tools`, `.bill-tools-actions`, `.bill-actions`, `.bill-intro`, header/footer, inputs, textareas, `.combo-list`, buttons, badges, remove column, status stay hidden (`display: none !important`); `.bill-card` has no border, radius, background or padding; `.bill-print-head` is a flex row, space-between, `border-bottom: 2px solid #111111`, title 24px 700, date 13px `#444444`; the print grid is `28px minmax(0,1.5fr) minmax(0,1.3fr) 44px 88px 96px` with gap 10px for `.bill-head`, `.bill-row`, `.bill-note`; head cells 11px, 700, uppercase; rows 13px; `.note-label` 10px 700; `.note-field` spans `2 / 7`; `.bill-item` has `border-bottom: 1px solid #DDDDDD` and `break-inside: avoid`; `.bill-note.is-empty` is hidden; `.bill-foot` is right-aligned with `border-top: 2px solid #111111`, `.summary-label` 13px 600, `.summary-total` 22px 700 followed by ` VND` (`::after`); `.bill-notes` is 12px with `border-top: 1px solid #999999`. `.print-only` mirrors still display as block. The mobile card rules must not apply in print (print repeats the table layout, resetting `display: contents` and the `order` values).
12. AC12 (no regressions): all classes in the existing contract list still appear as selectors; `.btn-primary`, `.btn-danger`, `.print-only`, `.bill-print-head` keep their screen defaults; the file still has no `@import`, no external URL and no `expression(`.

## Unit tests to write
Extend `sheet-rag/test/client/bill-css.spec.ts` (reuse its helpers; add one `it` per line):
- [ ] `design tokens are present and no web font is loaded`: covers AC1 and AC12 (colour literals present, no `Inter`, no `googleapis`, `main` max-width 1280px).
- [ ] `desktop grid template (design) on head, row, note and foot`: covers AC2 (update the `TEMPLATE` constant to `56px minmax(0,1.5fr) minmax(0,1.3fr) 96px 180px 170px 44px` and assert it for `.bill-foot` too; header cell uppercase and 13px).
- [ ] `card, input and focus styling`: covers AC3.
- [ ] `edited price border, badge and reset link`: covers AC4.
- [ ] `note label and note field spans, including the edited case`: covers AC5.
- [ ] `footer row and grand total columns`: covers AC6.
- [ ] `button variants`: covers AC7.
- [ ] `header, title size and language toggle`: covers AC8.
- [ ] `dropdown listbox, active option and hint`: covers AC9.
- [ ] `mobile card order and dark total bar` (the existing mobile test is updated: `.bill-row` and `.bill-note` are `display: contents`, drop the old `.bill-note` `1fr` assertion, keep the 44px loop and add `.lang-link`, `.lang-current`): covers AC10.
- [ ] `print layout is black and white with a 6-column table`: covers AC11 (the existing print tests stay and extend with the new selectors).
- [ ] `all contract classes exist` (extend the existing class list with the new classes listed above): covers AC12.

## Files this task may touch
- `sheet-rag/public/bill.css`
- `sheet-rag/test/client/bill-css.spec.ts`

Nothing else (no `app.css`, no `.tsx`, no `render.ts`). Shared with TASK-44: none (TASK-44 runs after this task and does not touch these files).

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
