# TASK-44: Billing page markup and copy for the approved design (header, footer row, language toggle, edited markers, row title, dropdown hint)

- id: TASK-44
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-43 (defines the CSS for every class below), plus TASK-35, TASK-36, TASK-37 (done)
- size: fits a 100k-token context (7 small source edits, 5 test files extended; no file over about 330 lines is rewritten)

## Why
TASK-43 restyles `bill.css` to the approved design. Some parts of the design cannot be done with CSS alone: they need different markup, a few new labels, or view-model text. Read TASK-43 first: its "Class contract" section fixes the class names used here. Design source (read-only): `/tmp/claude-0/-home-user-ks-oi/a0506c9d-4338-5493-bc9f-2b59bc791178/scratchpad/billing-design/project/Main.dc.html`, `Mobile.dc.html`, `Print.dc.html`.

## Decisions (lead)
- **Markup contract for `Bill.tsx`** (no inline styles, ids and `data-*` hooks that `main.ts` uses stay: `#bill-app`, `#bill-config`, `[data-bill-status]`, `[data-bill-date]`, `[data-bill-summary]`, `[data-action="add|clear|print|clear-draft"]`):
  - `div.bill-page` contains in order: `div.bill-header` (holds `div.bill-titlebox` with `h1` and `p.bill-intro`, and `div.bill-tools.no-print` with `p.bill-status[data-bill-status][role=status]` and `div.lang-toggle`), `div.bill-print-head`, `noscript`, `div.bill-card` (holds `div#bill-app.bill-grid` with the server header row, then `div.bill-foot` with `div.bill-actions.no-print` [Add row: `btn btn-outline`; Clear all: `btn`] and `div.bill-summary` with `span.summary-label` and `span.summary-total[data-bill-summary]`), then `div.bill-bottom` (holds `div.bill-notes` with fee note, disclaimer, privacy note, and `div.bill-tools-actions.no-print` with Print [`btn btn-primary`] and Clear draft [`btn`]), then the config script and `bill.js`. Every button keeps `type="button"`, `no-print` and its `data-action`.
  - `div.lang-toggle`: the current language as `<span class="lang-current" aria-current="true">VI</span>` (or `EN`) and the other language as the single `<a class="lang-link" href=... data-lang=... hreflang=... aria-label=...>` (visible text `EN` or `VI`; `aria-label` from `common.switchToEn` or `common.switchToVi`). Order is always VI then EN.
- **Layout.tsx**: new optional prop `hideLangNav?: boolean` (default false). When true the `<header><nav>` language link is not rendered (the bill page supplies its own toggle). Other pages are unchanged. Result: still exactly one `<a data-lang>` on the bill page.
- **Edited markers move into the note block** (design puts the badge and the "Dùng giá mặc định <price>" link next to the note, under the Pricing column). In `render.ts` the `.badge-edited` and the `.btn-reset` button (still a real `<button type="button">`, styled as a link by CSS) are created inside a `div.note-markers` that is the last child of `.bill-note` (after the textarea and its print mirror). `applyRowState` toggles class `is-edited` on the row's `.bill-item` from `view.showReset`; `patchRow` adds and removes the markers inside `.note-markers` instead of the price cell. The mobile order (markers between Pricing and Total) is done by TASK-43 CSS.
- **Row title for mobile cards**: `RowView.rowTitle` = `rowLabel` template ("Dòng {n}"). `render.ts` puts `<span class="row-title" data-field="rowTitle">` inside the `.c-index` cell, after the existing `data-field="index"` span, and `patchRow` updates it on renumbering. CSS (TASK-43) shows it on mobile only.
- **Reset text with the default price**: `RowView.defaultPriceText` (formatted default price, `""` when none) and `RowView.resetText` (`useDefault` label + space + default price; just the label if there is no default price). The reset button shows `resetText`.
- **Dropdown hint**: `render.ts` sets attribute `data-hint` (label `comboHint`) on the hotel `ul.combo-list` only (not the room list). The `li role="option"` children are unchanged, so keyboard and aria behaviour do not change.
- **Copy changes** (both languages in `vi.ts` and `en.ts`, parity test must stay green; no phone, Zalo or call wording): new key `comboHint` (vi `Không có trong danh sách? Cứ nhập tên khách sạn.`, en `Not in the list? Just type the hotel name.`). Updated values: vi `title` and `printTitle` `Bảng tính chi phí lưu trú`; vi `intro` `Chọn khách sạn và phòng, nhập số đêm, giá được điền sẵn và có thể sửa.`; en `intro` `Choose a hotel and room, enter the nights; the price is filled in and can be edited.`; vi `colPricing` `Đơn giá (VND)`, en `Price (VND)`; vi `edited` `Đã sửa giá`, en `Price edited`; vi `draftSaved` `Đã lưu bản nháp trên trình duyệt này`, en `Draft saved in this browser`. Other keys unchanged. Add `rowLabel` and `comboHint` to `LABEL_KEYS` in `src/client/bill/config.ts` (the client only receives listed keys). Dev must grep `test/` and `.team/testcases/` for any literal copy of a changed string and report it in Dev notes (do not edit files outside the list).
- Not changed: `main.ts` (all hooks it uses are kept), `src/index.ts`, wrangler files, `app.css`, `bill.css`, `bill.js` build config.

## Acceptance criteria
1. AC1 (header): the bill page renders `.bill-header` with `h1`, `.bill-intro`, the status paragraph (`data-bill-status`, `role="status"`) and `.lang-toggle`, in the order above; the status paragraph and tools block carry `no-print`.
2. AC2 (language toggle): in both languages the page has exactly one `<a>` with `data-lang` (pointing to the twin page, text `EN` or `VI`, `aria-label` from the common dictionary) and one `span.lang-current[aria-current="true"]`; `Layout` renders no `<header>` when `hideLangNav` is true and renders it unchanged otherwise.
3. AC3 (footer row): the card contains `.bill-foot` with Add and Clear buttons (classes `btn btn-outline` and `btn`) and `.bill-summary` holding `.summary-label` ("Tổng cộng" / "Grand total") and `.summary-total[data-bill-summary]`; Print (`btn btn-primary`) and Clear draft (`btn`) are in `.bill-tools-actions` after `.bill-notes`; all four buttons keep `no-print` and `data-action`.
4. AC4 (view model): `buildView` returns `rowTitle` ("Dòng 1"), `defaultPriceText` and `resetText` ("Dùng giá mặc định 1.430.000" shape) per row; for a row without a default price `defaultPriceText` is `""` and `resetText` is the plain label.
5. AC5 (edited markers): `render.ts` creates the badge and reset button inside `.note-markers` in the note block (not in the price cell), toggles `is-edited` on `.bill-item`, shows `resetText` on the button and removes the markers and the class when the price is no longer edited; the reset click handler still calls `onReset`.
6. AC6 (row title and hint): `render.ts` emits `.row-title` in the index cell, kept up to date by `patchRow`, and `data-hint` on the hotel listbox only; every class name it uses is declared in the `C` object and exists in `bill.css`.
7. AC7 (copy): the new and updated labels exist in both dictionaries; `LABEL_KEYS` contains `rowLabel` and `comboHint`.
8. AC8 (no regressions): the page still has no inline `style=`, no form, no phone or Zalo or admin link, exactly three scripts, one disclaimer, the fee note following the setting, the noscript message, and the config JSON still escapes `</script>`; existing behaviour of ids and aria attributes (listbox, option, `aria-label`s, remove button label) is unchanged.

## Unit tests to write
- [ ] `bill-page.spec.tsx` `header holds title, intro, status and language toggle in order`: covers AC1.
- [ ] `bill-page.spec.tsx` `one language link with data-lang and a current-language span in both languages` (replaces the old "bill anchors" assertions deliberately: the single bill anchor is now the `.lang-link` inside `main`, and the "no bill link inside main" check allows only that one): covers AC2 and AC8.
- [ ] `bill-page.spec.tsx` `footer row, summary label and tools buttons` (also keep the existing no-print and notes test green): covers AC3.
- [ ] `layout.spec.tsx` `hideLangNav removes the header link and default keeps it`: covers AC2.
- [ ] `bill-viewmodel.spec.ts` `rowTitle, defaultPriceText and resetText` (extend its `LABELS` with `rowLabel` and `useDefault`; vi and en number formats; no-default case): covers AC4.
- [ ] `bill-viewmodel.spec.ts` `render.ts source places markers in note-markers, toggles is-edited, sets data-hint and row-title` (source-text assertions like the existing class test; render.ts has no DOM test setup): covers AC5 and AC6.
- [ ] `bill-viewmodel.spec.ts` `render.ts uses only classes defined in bill.css` (existing test stays green with the new names): covers AC6.
- [ ] `bill-keys.spec.ts` `comboHint exists in both languages and updated labels are non-empty`: covers AC7.
- [ ] `bill-config.spec.ts` `LABEL_KEYS contains rowLabel and comboHint and missing keys fall back to their name`: covers AC7.

## Files this task may touch
- `sheet-rag/src/web/pages/Bill.tsx`
- `sheet-rag/src/web/pages/Layout.tsx`
- `sheet-rag/src/client/bill/render.ts`
- `sheet-rag/src/client/bill/viewModel.ts`
- `sheet-rag/src/client/bill/config.ts`
- `sheet-rag/src/web/i18n/vi.ts`
- `sheet-rag/src/web/i18n/en.ts`
- `sheet-rag/test/web/pages/bill-page.spec.tsx`
- `sheet-rag/test/web/pages/layout.spec.tsx`
- `sheet-rag/test/client/bill-viewmodel.spec.ts`
- `sheet-rag/test/client/bill-config.spec.ts`
- `sheet-rag/test/web/i18n/bill-keys.spec.ts`

Shared files: none with TASK-43 (it owns `bill.css` and `bill-css.spec.ts`). Must run after TASK-43.

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red first: 10 new tests failed for the right reasons before the source edits. Green: full suite `env -u CLOUDFLARE_API_TOKEN npm test -- --run` gives Test Files 45 passed (45), Tests 326 passed (326).
- Hono renders the bare hook `data-bill-summary` as `data-bill-summary="true"`; the footer test expects that string. Markup unchanged.
- `node scripts/build-client.mjs` builds `public/bill.js` (23550 bytes), exit 0.
- `scriptJson` escape set in Bill.tsx is byte-identical to HEAD (no diff noise there).
- Hard-coded changed copy outside the file list (not edited): `.team/testcases/TC-40.md` line 25 (vi header list uses "Pricing"; now "Đơn giá (VND)"), `.team/testcases/TC-41.md` line 21 (en column list uses "Pricing"; now "Price (VND)"; title "Hotel bill" is unchanged). Prose "Pricing" only (column name, still valid as a concept, check when pm reviews): `.team/testcases/TC-47.md`, `TC-48.md`, `TC-50.md`, `TC-59.md`, `TC-62.md`. Also `TC-49.md` mentions the marker (behaviour changed: marker now sits in the note block, not the price cell).
- Status discrepancy: TASK-43.md still reads `in-progress` although the coordinator says its bill.css is done. This task depends on it; left as is.
- Config build line is still a placeholder-like `npx wrangler deploy --dry-run`; the build run above used `node scripts/build-client.mjs` as the user asked.

## Review
<!-- Written by lead. Verdict: approve | rework
1. Specific, actionable note. -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
