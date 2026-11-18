# TC-9: Application reads the settings through getSettings with a local database

- id: TC-9
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC10 (also re-checks AC3, AC4, AC5 through the application code)
- status: todo
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

## Review
<!-- Written by qalead. -->

## Questions
<!-- Q: ...   A: ... -->
