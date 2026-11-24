# TASK-19: Page shell (HTML layout, CSS, language script)

- id: TASK-19
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend
- status: todo
- executor: local-dev
- rework count: 0
- depends on: TASK-14, TASK-18 (`escapeHtml`, `bi`), TASK-13 (the inline script mirrors `language.ts`)
- size: fits ~8k tokens with context (one module, mostly constants)

## Acceptance criteria
Covers STORY-11: AC38 (Vietnamese default; English toggle saved in localStorage and applied on every page), AC39 (missing/invalid saved value -> Vietnamese), AC40 (title/body shown as given), AC41 (phone layout: viewport meta, one-column cards, no horizontal scroll).
1. AC38/AC39: server markup is `<html lang="vi">`; the inline script reads `localStorage["hd.lang"]`, applies only "en" (anything else -> "vi") by setting the `lang` attribute; the VI/EN buttons save the choice.
2. AC41: viewport meta present and a `@media (max-width:600px)` rule makes `.cards` one column.

Tech decision (see Questions): server-rendered HTML, no UI framework; each text is rendered twice (`bi()`), CSS hides the language not selected, so English can be applied instantly from localStorage on every page.

## Spec for local-dev (copy into the spec file)
File: `sheet-rag/src/lookup/layout.ts`. Imports only `import { escapeHtml } from "./escape"; import { bi } from "./i18n";`. Exports exactly:
```ts
export const PAGE_CSS: string
export const LANG_SCRIPT: string
export function renderPage(opts: { title: string; body: string }): string
```
- `PAGE_CSS` (single string, minified-ish, must contain these rules verbatim):
  `html[lang="vi"] .en{display:none}` `html[lang="en"] .vi{display:none}` `*{box-sizing:border-box}` `body{margin:0;font-family:system-ui,sans-serif;color:#1a1a1a;background:#f6f7f9}` `main,.top{max-width:1100px;margin:0 auto;padding:12px 16px}` `img{max-width:100%;height:auto}` `table{width:100%;border-collapse:collapse}` `td,th{padding:6px;text-align:left;word-break:break-word}` `.table-wrap{overflow-x:auto}` `.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}` `.card{background:#fff;border-radius:8px;padding:12px}` `.tabs,.letters,.chips{display:flex;flex-wrap:wrap;gap:6px}` `.letter.disabled{opacity:.4}` `.tab.active,.letter.active{font-weight:700}` `.gallery img{width:100%;max-height:360px;object-fit:cover}` `@media (max-width:600px){.cards{grid-template-columns:1fr}body{font-size:16px}}`
- `LANG_SCRIPT` = exactly this string (one line):
  `(function(){var d=document.documentElement,k="hd.lang";function get(){try{return localStorage.getItem(k)==="en"?"en":"vi"}catch(e){return"vi"}}function apply(l){d.setAttribute("lang",l)}apply(get());var b=document.querySelectorAll("[data-lang]");for(var i=0;i<b.length;i++){b[i].addEventListener("click",function(e){var l=e.currentTarget.getAttribute("data-lang");if(l!=="vi"&&l!=="en")return;try{localStorage.setItem(k,l)}catch(x){}apply(l)})}})();`
- `renderPage({title, body})` returns exactly (newlines optional, text exact):
  `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head><body><header class="top"><a class="brand" href="/hotels">${bi("siteTitle")}</a> <span class="langs"><button type="button" data-lang="vi">VI</button> <button type="button" data-lang="en">EN</button></span></header><main>${body}</main><script>${LANG_SCRIPT}</script></body></html>`
  `body` is inserted as-is (already HTML); `title` is escaped.
- Example: `renderPage({title:"A & B", body:"<p>x</p>"})` contains `<title>A &amp; B</title>` and `<main><p>x</p></main>`, starts with `<!doctype html><html lang="vi">`.

## Unit tests to write
- [ ] `starts with doctype and html lang vi (default Vietnamese)`: covers AC38, AC39
- [ ] `script uses localStorage key hd.lang and falls back to vi unless value is en`: covers AC38, AC39
- [ ] `has VI and EN buttons with data-lang`: covers AC38
- [ ] `has viewport meta and mobile one-column rule`: covers AC41
- [ ] `title is escaped and body inserted as is`: covers AC40
- [ ] `CSS hides the inactive language`: covers AC38

## Files this task may touch
- `sheet-rag/src/lookup/layout.ts`
- `sheet-rag/test/lookup/layout.spec.ts`

Test command (fill in config.md before dispatch): from `sheet-rag/`: `npx vitest run test/lookup/layout.spec.ts`

## Dev notes

## Review

## Questions
Q: The project has no UI framework. How is the directory/detail UI delivered (SPA framework, static assets, server-rendered)?
A: Server-rendered HTML from the Cloudflare Worker (plain template strings, no framework, no build step, no client bundle). Filters, tabs, letter bar and "Load more" are plain links/GET forms carrying state in the URL query string (TASK-16), so pages work without JavaScript. Only JavaScript: the tiny inline language script above (localStorage). Routes: `/hotels` and `/hotels/<id>` (TASK-31). This decision applies to TASK-16 to TASK-32 and does not change any file list.
