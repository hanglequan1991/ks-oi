# TASK-10: Browser language memory script (public/lang.js)

- id: TASK-10
- story: [STORY-16](../stories/STORY-16.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-6 (test glob `test/client/**`)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Technical design section 12: the toggle writes `hd_lang` to `localStorage` inside `try/catch`; a small script loaded before the body redirects to the saved language; first visit stays Vietnamese; no-JS users and crawlers are never redirected by script. The script is a plain, dependency-free browser file (served as a static asset; no build step exists), so it can be loaded by the layout (TASK-9) as `/lang.js` with no inline code.

`public/lang.js`: an IIFE using `window.localStorage`, `window.location`, `document`. Behaviour:
- On load: read `hd_lang` in `try/catch`. Saved `en` while the path is not `/en` or `/en/...` leads to `location.replace('/en' + pathname + search + hash)` (root `/` becomes `/en/`). Saved `vi` while on an `/en` path leads to `location.replace` of the path without the `/en` prefix (`/en` or `/en/` becomes `/`), keeping search and hash. Any other saved value, nothing saved, or a thrown error: do nothing.
- Skip the redirect when the visitor just chose a language by following a toggle link: the click handler (below) writes the choice first, so the destination already matches and no loop occurs.
- Click handler (event delegation on `document`): a click on `a[data-lang]` writes `hd_lang` = the link's `data-lang` (`vi` or `en`) in `try/catch`, then lets the link navigate normally.
- Never throw; never touch the DOM besides adding the one listener.
- To make it testable under Node, the file must run inside `vm.runInNewContext(source, sandbox)` where `sandbox` provides `window`, `localStorage`, `location` (`pathname`, `search`, `hash`, `replace`) and `document` (`addEventListener`). It must not use `import`, `export`, `require` or `module`.

## Acceptance criteria
1. AC3: Saved `en` on `/bill?x=1` redirects to `/en/bill?x=1`; saved `vi` on `/en/bill` redirects to `/bill`; saved `en` on `/` goes to `/en/`; saved `vi` on `/en/` goes to `/`.
2. AC3: Clicking an `a[data-lang="en"]` link stores `en`; `data-lang="vi"` stores `vi`.
3. AC3: Saved value matching the current path language causes no redirect (no loop).
4. AC4: Nothing stored: no redirect, no write.
5. AC5: `localStorage` getter or `getItem`/`setItem` throwing: the script does not throw and does not redirect; the click still lets navigation proceed (no `preventDefault`).
6. Unknown stored value (`fr`) gives no redirect.

## Unit tests to write
All in `test/client/lang.spec.ts`, running `public/lang.js` through `node:vm` with fake `location`, `localStorage`, `document`.
- [ ] `saved en on a Vietnamese URL redirects to the /en URL keeping search and hash`: covers AC3
- [ ] `saved vi on an English URL redirects to the Vietnamese URL`: covers AC3
- [ ] `root and /en/ map to each other`: covers AC3
- [ ] `matching language does not redirect`: covers AC3
- [ ] `clicking a language link remembers the choice and does not prevent navigation`: covers AC2, AC5
- [ ] `nothing stored means no redirect`: covers AC4
- [ ] `blocked storage never throws and never redirects`: covers AC5
- [ ] `unknown stored value is ignored`: covers AC6

## Files this task may touch
- `sheet-rag/public/lang.js` (new)
- `sheet-rag/test/client/lang.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
