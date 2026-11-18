# TASK-9: Shared page Layout, renderPage guard and base stylesheet

- id: TASK-9
- story: [STORY-16](../stories/STORY-16.md)
- type: frontend        <!-- frontend | backend -->
- status: todo
- rework count: 0
- depends on: TASK-8 (components), TASK-7 (i18n helpers), TASK-6
- size: fits a 100k-token context (few files, one behaviour)

## Why
One layout for every Version 1 page (technical design 11.5, 12). It declares the language, language alternates, noindex, the language toggle and loads `/lang.js` (TASK-10) and `/app.css`. `renderPage` is the guard that makes "no page can show a price without the disclaimer" true by construction.

`src/web/pages/Layout.tsx`:
`Layout({ lang, path, origin, title, settings, showsPrice, children })`
- `<html lang="vi|en">`; `<meta charset>`, viewport, `<title>`.
- `<meta name="robots" content="noindex, nofollow">` (AC9; Version 1 pages are noindex).
- `<link rel="canonical">` = `origin + pathForLang(path, lang)`; `<link rel="alternate" hreflang="vi|en|x-default">` (x-default = Vietnamese URL).
- `<link rel="stylesheet" href="/app.css">` and a synchronous `<script src="/lang.js">` in `<head>` (no `defer`, no inline script, so the redirect happens before the body is shown and CSP `script-src 'self'` is satisfied).
- Language toggle: a link to the same page in the other language, `<a href="..." data-lang="en|vi" hreflang="...">` with text from `common.switchToEn/Vi` (real links, so no-JS users and crawlers work).
- `<main id="main">` with children; a `<footer>` that renders `<Disclaimer>` once when `showsPrice` is true.
- No link to `/bill` and no admin link (billing page is not linked anywhere).

`src/web/render.ts`: `renderPage(c, element)` returns `c.html('<!DOCTYPE html>' + String(element))` and throws before responding if the HTML contains `data-price` but no `data-disclaimer`.

`public/app.css`: minimal responsive base styles (no external fonts or imports; class names used above). Not unit tested beyond existence.

## Acceptance criteria
1. AC1: Rendering `Layout` with `lang="vi"` gives `<html lang="vi"`.
2. AC2: With `lang="en"` gives `<html lang="en"`, canonical and hreflang point to `/en/...`.
3. AC4: A request to a sample route at its normal address (no `/en`, no cookies, no storage) is rendered in Vietnamese (the server never reads storage).
4. AC9: Every page includes the robots noindex meta.
5. AC7: When `showsPrice` is true the footer contains `data-disclaimer` in the page language; `renderPage` throws if `data-price` is present without `data-disclaimer`; it does not throw for a page without prices (and then no disclaimer is required).
6. AC8: A page with a `PriceBlock` shows the fee note when `showFeeNote` is on and not when off (end-to-end through `renderPage`).
7. AC3 / AC5 (server side): the page contains `<script src="/lang.js">` with no inline script body, and the toggle link works as a normal link (`href` is the other-language URL), so the page works when storage is blocked.
8. Output has no inline `style=` attributes and no inline `<script>` content (CSP).

## Unit tests to write
All in `test/web/pages/layout.spec.tsx` (render with `new Hono()` and `app.request`).
- [ ] `vi page declares lang vi, en page declares lang en`: covers AC1, AC2
- [ ] `canonical and hreflang alternates are correct for both languages`: covers AC2
- [ ] `normal address renders Vietnamese with nothing stored`: covers AC4
- [ ] `every page has a noindex robots meta`: covers AC9
- [ ] `showsPrice adds the disclaimer in the page language`: covers AC7
- [ ] `renderPage throws when a price has no disclaimer, and allows price-free pages`: covers AC7
- [ ] `fee note follows the setting through renderPage`: covers AC8
- [ ] `loads lang.js as an external script and the toggle is a plain link`: covers AC3, AC5
- [ ] `no inline style attributes or inline scripts`: covers AC8 (CSP compatibility)

## Files this task may touch
- `sheet-rag/src/web/pages/Layout.tsx` (new)
- `sheet-rag/src/web/render.ts` (new)
- `sheet-rag/public/app.css` (new)
- `sheet-rag/test/web/pages/layout.spec.tsx` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
