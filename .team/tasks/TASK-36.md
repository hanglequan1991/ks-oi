# TASK-36: Page config parser, entry wiring and client safety guard (src/client/bill/config.ts, main.ts)

- id: TASK-36
- story: [STORY-11](../stories/STORY-11.md)
- type: frontend        <!-- frontend | backend -->
- status: in-progress
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

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
