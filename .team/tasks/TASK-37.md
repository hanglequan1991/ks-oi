# TASK-37: Billing page shell (src/web/pages/Bill.tsx)

- id: TASK-37
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-9 (`Layout`), TASK-8 (`Disclaimer`, `FeeNote`), TASK-27 (`bill` dictionary), TASK-7 (`t`, `format`), TASK-5 (`SiteSettings` type), TASK-33 (class contract), TASK-6 (JSX), TASK-26 (limits from `src/domain/money.ts`, AC9)
- size: fits a 100k-token context (one component and its test)

## Why
Server-rendered page shell (design 18.1, 18.5, 18.9). The grid rows are built by the client bundle; the server renders everything static, the translation block and the fee note and disclaimer from the seeded settings. A phone number, call button and Zalo link are not rendered (decision 2026-11-18).

`sheet-rag/src/web/pages/Bill.tsx`: `export function BillPage(props: { lang: Lang; path: string; origin: string; settings: SiteSettings }): JSX.Element`, rendered through `Layout` with **`showsPrice={false}`**: the page has no server-rendered `data-price`, and it renders `<Disclaimer>` and `<FeeNote>` itself inside `<main>` (so the printed bill, which hides the layout header and footer, still carries them, and the disclaimer appears exactly once). Content:
- `<link rel="stylesheet" href="/bill.css">` and `<script src="/bill.js" defer></script>` (external, no inline code);
- `<div class="bill-page">` with title (`bill.title`), intro, `.bill-print-head` (title and an empty `<span data-bill-date>`), `<noscript><p class="bill-noscript">` with `bill.noscript`;
- `<div id="bill-app" class="bill-grid">` (the client fills it) with the header row `.bill-head` (columns `#`, Hotel, Room, Night, Pricing, Total from `bill.col*`) rendered by the server so the page is not blank before the script runs;
- `.bill-actions` buttons with `data-action="add|clear|print|clear-draft"` and `.no-print`, `.bill-status` `<p data-bill-status role="status">`, `.bill-summary` with `bill.grandTotal` and `<span data-bill-summary>`;
- `.bill-notes` with `<FeeNote>` and `<Disclaimer>` (language and text from settings) and the privacy note `bill.privacyNote`;
- `<script type="application/json" id="bill-config">` with `{ lang, labels: <the whole bill group of that language>, maxRows, maxNights, maxNote }`; the JSON is serialised with `<`, `>`, `&`, U+2028 and U+2029 escaped (`<` ...) so a label can never close the script tag.
No link to `/bill` (self-links or alternates beyond what `Layout` adds), no `/admin` link, no `tel:` or Zalo link, no `style=` attributes.

## Acceptance criteria
1. AC1 / AC2: with `lang="vi"` the page text uses Vietnamese labels, with `en` English labels (title, column titles, `NOTE` label text is in the config, intro); `<html lang>` follows (via `Layout`).
2. AC7: the server-rendered header row has the six columns `#`, Hotel, Room, Night, Pricing, Total in that order in the page language; no data rows are rendered by the server.
3. AC35: the disclaimer text is exactly the settings text of the page language, appears **once** (one `data-disclaimer`), and the fee note shows `Includes 10% service fee` for en with `showFeeNote` true and fee 10, and is absent when `showFeeNote` is false; the percentage follows the setting (12.5 shows `12.5%`).
4. AC35 / scope: output contains none of `tel:`, `zalo`, `Zalo`, `phone`, `/admin`, `href="/bill"`, `href="/en/bill"` (the only allowed `bill` URLs are the canonical and alternate `<link>` tags emitted by `Layout`).
5. AC40: output contains a `<noscript>` with the JavaScript-required text in the page language.
6. AC10 / CSP: the config JSON parses back to the labels; a label (from a fake dictionary in the test) containing `</script><script>alert(1)</script>` does not appear raw in the HTML; the only `<script>` elements are `/lang.js`, `/bill.js` and the JSON block; no inline `style=`.
7. AC9: the config carries `maxNote` 500, `maxRows` 30, `maxNights` 365 from `money.ts`.
8. AC36: the page has `.bill-print-head`, the actions are marked `no-print`, and the fee note and disclaimer are inside `.bill-notes` (not in a `.no-print` element).
9. AC34: the page contains no `<form>` and no `action=` (nothing can be posted).

## Unit tests to write
In `test/web/pages/bill-page.spec.tsx` (render through `renderPage` with `new Hono()` and fake settings; no database).
- [ ] `vi and en pages use their own labels`: covers AC1
- [ ] `server header row has the six columns and no data rows`: covers AC2
- [ ] `disclaimer once from settings and fee note follows the setting`: covers AC3
- [ ] `no phone, zalo, admin or self links`: covers AC4
- [ ] `noscript message in both languages`: covers AC5
- [ ] `config json is safe against script injection and the only scripts are external plus the json block`: covers AC6
- [ ] `limits in the config come from the code`: covers AC7
- [ ] `print head, no-print actions and notes block`: covers AC8
- [ ] `page has no form`: covers AC9

## Files this task may touch
- `sheet-rag/src/web/pages/Bill.tsx` (new)
- `sheet-rag/test/web/pages/bill-page.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
