# TASK-37: Billing page shell (src/web/pages/Bill.tsx)

- id: TASK-37
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: review
- assignee: dev
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
No link to `/bill` or `/en/bill` from the page body (`Bill.tsx` adds none); the only references to the bill URL allowed in the output are what `Layout` emits: the language toggle (the single `<a>` to the other language's twin: `/en/bill` on vi, `/bill` on en) and the canonical and hreflang alternate `<link>` tags. No `/admin` link, no `tel:` or Zalo link, no `style=` attributes.

## Acceptance criteria
1. AC1 / AC2: with `lang="vi"` the page text uses Vietnamese labels, with `en` English labels (title, column titles, `NOTE` label text is in the config, intro); `<html lang>` follows (via `Layout`).
2. AC7: the server-rendered header row has the six columns `#`, Hotel, Room, Night, Pricing, Total in that order in the page language; no data rows are rendered by the server.
3. AC35: the disclaimer text is exactly the settings text of the page language, appears **once** (one `data-disclaimer`), and the fee note shows `Includes 10% service fee` for en with `showFeeNote` true and fee 10, and is absent when `showFeeNote` is false; the percentage follows the setting (12.5 shows `12.5%`).
4. AC35 / scope: output (both languages) contains none of `tel:`, `zalo`, `Zalo`, `phone`, `/admin`. Any `href` to `/bill` or `/en/bill` is forbidden except the two `Layout`-emitted references: (a) the language toggle `<a>` to the twin page (exactly one such `<a>`; on `en` it is `/bill`, on `vi` it is `/en/bill`), and (b) the canonical and hreflang alternate `<link>` tags (absolute URLs). Nothing inside `<main>` (the `Bill.tsx` content) links to a bill URL.
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
- [ ] `no phone, zalo or admin links; bill URL only via layout language toggle and canonical/hreflang`: covers AC4 (renders both vi and en)
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
- `src/web/pages/Bill.tsx` and `test/web/pages/bill-page.spec.tsx` written. 8 of 9 unit tests pass.
- Resolved per lead's answer: AC4 test renamed `no phone, zalo or admin links; bill URL only via layout language toggle and canonical/hreflang`. It runs for vi and en; the blanket list is now tel:/zalo/Zalo/phone//admin only; exactly one bill `<a>` (identified by Layout's `data-lang` marker) must point to the twin page; no bill `<a>` inside `<main>`; href|src bill URLs limited to the absolute canonical/hreflang URLs, `/bill.css`, `/bill.js` and the toggle target. Bill.tsx and Layout unchanged.
- Full run: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` gives 36 files, 234 tests, all passed (includes bill-page.spec.tsx 9/9).
- Test for `defer`: Hono renders `defer=""`, so the assertion accepts both forms.
- The `no form` test uses `(?<![\w-])action=` so that `data-action` buttons (required by the spec) are not counted.
- The `config json` test injects the fake label by mutating the shared `en.bill.noteLabel` object and restores it in `afterEach`.

## Questions
Q: AC4 / unit test "no phone, zalo, admin or self links" forbids `href="/bill"` and `href="/en/bill"`, but `Layout` always emits a language toggle link to the other language's version of the same page (`href="/bill"` on `en`, `href="/en/bill"` on `vi`). Bill.tsx cannot remove it without changing Layout (not in this task's file list). Should the check exclude the Layout-emitted toggle link (the spec's "beyond what Layout adds" wording suggests yes), or should Layout be changed to skip the toggle on this page (needs a file added to TASK-37 or a new task)?
A: Exclude the Layout-emitted references; do not change Layout (TASK-9 is done and the language toggle is a required feature; STORY-11 AC3/AC4 forbid other pages linking to the bill page, not the bill page linking to its own language twin). The file list is unchanged. AC4, the "Why" wording and the test name above are updated. Required change to the dev's test `no phone, zalo, admin or self links` (rename as in the test list; code in `Bill.tsx` stays as is):
1. Run it for both `vi` and `en`.
2. Keep `not.toContain` for `tel:`, `zalo`, `Zalo`, `phone`, `/admin`. Remove `href="/bill"` and `href="/en/bill"` from that blanket list.
3. Collect every `<a ... href="X">` in the HTML. Those with X matching `^(/en)?/bill/?(\?|#|$)` must number exactly one, and it must be the Layout language toggle with the twin target (`en` page: `/bill`; `vi` page: `/en/bill`); identify it by the same marker Layout uses for the toggle (read Layout.tsx). Also assert no such `<a>` exists inside the `<main>` content.
4. Keep the `href|src` bill-URL scan, but allow exactly: absolute `https://example.test/...` canonical/hreflang URLs, `/bill.css`, `/bill.js`, and the toggle target from step 3; anything else fails.
Then set status to review when 9 of 9 pass.

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
