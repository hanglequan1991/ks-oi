# TC-9: Application reads the settings through getSettings with a local database

- id: TC-9
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC10 (also re-checks AC3, AC4, AC5 through the application code)
- status: review
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-9.e2e.ts`
- runs without Cloudflare credentials: yes (imports `getSettings` from `sheet-rag/src/db/settings.ts` and the fake D1 cast `as unknown as D1Database`)

## Preconditions
- TASK-1 to TASK-5 are done (`src/db/settings.ts` exports `getSettings(db, onWarn?)`).
- `CLOUDFLARE_API_TOKEN` is deleted at the start of the test; the test makes no network call (assert that `fetch` is not called by replacing `globalThis.fetch` with a function that fails the test).

## Steps
1. Migrate a fresh fake D1 and call `getSettings(db)`.
2. Update `service_fee_percent` to `12` and `show_fee_note` to `false`, run `applyMigrations(db)` again, call `getSettings(db)`.
3. Set `service_fee_percent` to `abc` and call `getSettings(db, onWarn)` with a spy.
4. Empty the `settings` table and call `getSettings(db, onWarn)`.

## Expected results
1. Result is `{ serviceFeePercent: 10, showFeeNote: true, disclaimerVi: <agreed Vietnamese text>, disclaimerEn: <agreed English text> }`; texts compared with the literals from implementation-plan.html section 5 (same literals as TC-4).
2. Result has `serviceFeePercent` 12 and `showFeeNote` false; the disclaimers are unchanged.
3. `serviceFeePercent` falls back to 10 and `onWarn` is called exactly once.
4. No error is thrown; fee 10, fee note true, both disclaimers are empty strings.
5. Throughout, no network call was made and the test passed with no Cloudflare credentials.

## Test data
- Fee values: 10 (seed), 12, `abc`.

## QA notes
<!-- Written by qa. -->
- Automation test: `sheet-rag/e2e/TC-9.e2e.ts` (Node-only, chromium project only; imports `getSettings` via relative path `../src/db/settings`; Playwright loads the TypeScript source with no config change).
- Network blocked: `globalThis.fetch` is replaced by a counting stub that throws; asserted 0 calls. `CLOUDFLARE_API_TOKEN` deleted at start and asserted unset.
- Run: `npx playwright test -c playwright.node.config.ts e2e/TC-9.e2e.ts --trace off --project=chromium` (inside `sheet-rag/`): 1 passed.
- Expected texts are the TC-4 literals; `onWarn` spy asserted to be called exactly once for `abc`.

## Review
<!-- Written by qalead. -->
Verdict: approve

- Re-ran `npx playwright test -c playwright.node.config.ts e2e/TC-9.e2e.ts --trace off --project=chromium` in `sheet-rag/`: 1 passed.
- Steps 1 to 4 are followed in order. Expected results are asserted with real values: defaults via `toEqual` against the literal VI/EN texts, then fee 12 and note false after a second `applyMigrations` with the disclaimers unchanged, then fee 10 with exactly one `onWarn` call for `abc`, then an empty table giving fee 10, note true and empty disclaimers without throwing.
- Expected result 5 is covered: `fetch` is replaced with a counting stub that throws, `fetchCalls` is asserted to be 0, and `CLOUDFLARE_API_TOKEN` is deleted and asserted unset.
- No sleeps, no selectors. The test touches only its own file and uses the shared fakes read-only.
- Optional, non-blocking: step 4 collects `emptyWarnings` but does not assert on it, which is fine because the TC does not specify it.

## Questions
<!-- Q: ...   A: ... -->
