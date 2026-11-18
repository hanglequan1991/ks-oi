# TASK-36: Page config parser, entry wiring and client safety guard (src/client/bill/config.ts, main.ts)

- id: TASK-36
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-28, TASK-29, TASK-30, TASK-31, TASK-32, TASK-35 (all client modules), TASK-34 (bundle must build), TASK-26 (limits from `src/domain/money.ts`)
- size: fits a 100k-token context (a small pure parser, a wiring file of about 200 lines, one guard test)

## Why
The entry point that connects state, storage, API, comboboxes and the DOM builder. Wiring cannot be unit tested without a browser, so the logic that can be tested is kept in `config.ts` and the correctness of the wiring is checked by (a) a **source guard test** over the whole `src/client/bill/` folder and (b) the Playwright TCs written later by qa. `src/client/` imports only `src/domain/` and its own folder.

`sheet-rag/src/client/bill/config.ts` (pure):
```ts
export interface BillConfig { lang: 'vi' | 'en'; labels: Record<string, string>; maxRows: number; maxNights: number; maxNote: number }
export function parseBillConfig(text: string | null | undefined): BillConfig | null;   // JSON from <script type="application/json" id="bill-config">
```
Validation: `lang` must be `vi` or `en`; `labels` must be an object of strings (non-string values dropped; missing keys fall back to the key name so the page never shows `undefined`); limits are taken from `money.ts` (the JSON values are ignored if they differ, so a tampered page cannot raise the limits); invalid JSON or wrong shape gives `null` and `main.ts` then shows `labels`-free English fallback text `Could not start the billing page` inside `#bill-app` (via `textContent`).

`sheet-rag/src/client/bill/main.ts`: on `DOMContentLoaded` (or immediately if the document is ready) it
1. reads the config; finds `#bill-app` and the static elements by `data-` attributes set by TASK-37 (`data-bill-summary`, `data-bill-status`, `data-bill-date`, buttons `data-action="add|clear|print|clear-draft"`);
2. loads the draft (`loadDraft(localStorage in try/catch)`), starts from `createInitialState` or hydrates, and for each distinct `hotelSlug` calls `api.loadRooms(slug)` then dispatches `applyRooms` (AC32), showing `labels.draftRestored`; a failed load keeps the stored values and shows nothing alarming;
3. subscribes: render on structural changes, `patchRow`/`renderSummary` on typing, debounced `saveDraft` (300 ms) with `labels.draftSaved` shown only after a successful save; flush on `pagehide`;
4. hotel input: `setHotelText` on input + `suggester.request`; options from the API, picking sets `pickHotel` and starts `loadRooms`; blur keeps the typed text (free text, AC13); room input: options are `filterOptions` over the cached rooms of the picked hotel; none when `roomHasList` is false; keyboard via `comboStep`/`comboAria`; options picked on `mousedown` (so blur does not lose the pick);
5. Night: input filtered by `nightsText`, dispatches `setNights` when a value exists, restores `1` on blur if empty; Pricing: `reformatPriceInput` keeps the caret, dispatches `setPrice`; reset button dispatches `resetPrice`; Note: `setNote`; Add / Remove / Clear all (`confirm(labels.clearConfirm)`, only on OK, AC30) / Clear draft (clears storage and resets the grid, AC33) / Print (`window.print()`); sets `[data-bill-date]` text with `dateLabel(new Date(), lang)` before printing;
6. never sends bill data anywhere; the only network calls are the two GET calls of `api.ts`.

## Acceptance criteria
1. AC40 / AC1: `parseBillConfig` of a valid JSON returns the config; the page without JavaScript shows the `<noscript>` message (TASK-37).
2. AC9 / AC26 / AC27: limits in the returned config come from `money.ts` even when the JSON says `maxRows: 9999`.
3. AC10: invalid JSON, a JSON array, a labels object with numbers or `null`, and a very large payload give `null` or cleaned labels, never a throw; missing label keys fall back to the key name.
4. AC34 (guard): a test scans every `.ts` file in `src/client/bill/` and fails when it finds `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `method: 'POST'`/`"POST"`/`PUT`/`DELETE`/`PATCH`, `/admin`, `import(` (dynamic import) or an `import ... from` that points outside `./` or `../../domain/`; it also checks that `fetch` appears only in `main.ts` (passed to `createBillApi`) and `api.ts`.
5. AC34 / AC31 (guard): `localStorage` is referenced only in `main.ts` and the only key string in the folder is `hd_bill_v1` (declared once in `storage.ts`).
6. AC35 / scope: no file in `src/client/bill/` contains `tel:`, `zalo`, or a phone-number pattern.
7. The bundle builds: `buildClient()` from TASK-34 on `src/client/bill/main.ts` succeeds into a temp file and the result contains no `innerHTML`.
8. Behaviour of the wiring (AC11 to AC33, AC36 to AC39) is verified by Playwright test cases (qa), not by unit tests; the dev records in Dev notes which manual steps were done in a browser if one was available.

## Unit tests to write
In `test/client/bill-config.spec.ts` and `test/client/bill-guard.spec.ts`.
- [ ] `valid config is parsed`: covers AC1
- [ ] `limits come from the code, not the page`: covers AC2
- [ ] `bad config never throws and falls back`: covers AC3
- [ ] `client sources contain no html injection, no writes to the network and no admin or outside imports`: covers AC4
- [ ] `only main.ts touches localStorage and only with the draft key`: covers AC5
- [ ] `no phone or zalo in client code`: covers AC6
- [ ] `the client bundle builds and stays free of innerHTML`: covers AC7

## Files this task may touch
- `sheet-rag/src/client/bill/config.ts` (new)
- `sheet-rag/src/client/bill/main.ts` (new)
- `sheet-rag/test/client/bill-config.spec.ts` (new)
- `sheet-rag/test/client/bill-guard.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Tests: `bill-config.spec.ts` 6 tests, `bill-guard.spec.ts` 7 tests, all green. Full unit suite 40 files, 269 tests, green.
- Guard scope: comments are stripped before the code checks (`code()`), so header prose such as "no fetch" does not count. The phone and zalo checks run on raw text, comments included.
- `tel:` check uses `\btel:` (word boundary). Without it, `render.ts` (`hotel: "c-hotel"`) gave a false positive. This is a judgement call in the guard test only; `render.ts` was not touched.
- For lead: `main.ts` appends its own `div.bill-rows` inside `#bill-app`, because `renderRows` calls `replaceChildren()` and that would delete the server-rendered `.bill-head`. Check that the TASK-33 CSS handles this extra wrapper.
- Clear draft (`data-action="clear-draft"`) has no confirm. The spec does not ask for one.
- Manual browser steps: none. No browser was available, so the wiring is untested until qa's Playwright TCs run.
- Not verified: a standalone `tsc --noEmit` (not part of the allowed test command). The bundle test (`buildClient` on `main.ts`) passes, so the bundle builds.

## Review
Verdict: approve (lead, 2026-11-18). Full run: 40 files, 269 tests passed (bill-config 7 tests, bill-guard 7 tests). Only the four listed files are new.
- `config.ts`: pure; invalid JSON, arrays, non-object labels, oversized text return null, never throw; non-string labels dropped, missing keys fall back to key name, `__proto__` skipped; limits always from `money.ts`.
- `main.ts` wiring: state store, storage (`loadDraft`/`saveDraft`/`createSaver`/`clearDraft`), combobox (`comboStep`/`comboAria`/`filterOptions`), `createBillApi` + `createSuggester`, `format`, `viewModel`/`render` are all used. Picks on `mousedown`, Clear all confirms, Clear draft clears storage and resets, Print sets `[data-bill-date]` first, `pagehide` flushes, draft restore reloads rooms per slug and a failed load is silent. No `innerHTML` (bundle test checks too); only network calls are the two GETs in `api.ts` (`/api/suggest`, `/api/hotels/:slug?lang=`, `credentials: 'omit'`); no localStorage outside `main.ts` (wrapped in try/catch) and the only key is `hd_bill_v1` in `storage.ts`; no tel/zalo/phone.
- `div.bill-rows` wrapper: compatible, no change needed in any task. `Bill.tsx` (TASK-37) renders `#bill-app.bill-grid` (display: block) holding the server `.bill-head`; `main.ts` appends `.bill-rows` after it, so `replaceChildren()` in `renderRows` only clears the rows and keeps the head. `public/bill.css` (TASK-33) has no rule for `.bill-rows` and no child combinators (`>`), so it is an unstyled block; the grid templates sit on `.bill-head`, `.bill-row` and `.bill-note`, which stay in the same relative order (`.bill-head`, then `.bill-item` > `.bill-row` + `.bill-note`), and the mobile and print rules select by class only. Column alignment holds because head, row and note all use the same 7-column template. Only effect: if config parsing fails, `app.textContent` replaces the head too (acceptable, shows the fallback message).
- JS-required path: `<noscript>` message and static head are in `Bill.tsx`; `/bill.js` is deferred.
- Guard test covers: forbidden APIs, HTTP methods, `/admin`, dynamic import, imports outside `./` and `../../domain/`, fetch only in `main.ts` and `api.ts`, localStorage only in `main.ts`, single key. Judgement call on `\btel:` word boundary accepted (avoids a false hit on `hotel:` in `render.ts`).
- Not verified (accepted): no browser run; behaviour is for qa's Playwright TCs.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
