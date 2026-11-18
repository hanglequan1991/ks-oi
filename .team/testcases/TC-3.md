# TC-3: A setting changed after seeding survives a migration re-run

- id: TC-3
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC5
- status: done
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-3.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1.

## Steps
1. Create a fake D1 and run `applyMigrations(db)`.
2. Update `service_fee_percent` to `12`, `show_fee_note` to `false`, and `disclaimer_en` to `Custom English text`.
3. Run `applyMigrations(db)` again.
4. Read all rows of `settings`.
5. Edge: delete the `data_version` row, run `applyMigrations(db)` again, read `settings`.

## Expected results
1. Migration succeeds with seeded defaults.
2. Updates succeed (each affects 1 row).
3. The re-run succeeds.
4. `service_fee_percent` is `12`, `show_fee_note` is `false`, `disclaimer_en` is `Custom English text`; `disclaimer_vi` still has its seeded value; there are still 5 rows.
5. A deleted seeded key is re-created with its default (`data_version` = `1`), while the previously edited values are still kept (12, false, custom text).

## Test data
- Fee 12, fee note `false`, English disclaimer `Custom English text`.

## QA notes
<!-- Written by qa. -->
- Automated in `sheet-rag/e2e/TC-3.e2e.ts` (Node-only, fake D1, chromium project only).
- Covers steps 1-5 and expected results 1-5: three edits each affect 1 row, re-run keeps edits and the 5 rows, deleted `data_version` is re-created as `1` while the edits stay.
- Run: `npx playwright test -c playwright.node.config.ts e2e/TC-3.e2e.ts --trace off --project=chromium` -> 1 passed.

## Review
<!-- Written by qalead. -->
Verdict: approve

- Ran `npx playwright test -c playwright.node.config.ts e2e/TC-3.e2e.ts --trace off --project=chromium` in `sheet-rag/`: 1 passed.
- Follows steps 1-5 in order. Asserts each expected result: three updates each affect 1 row, the re-run resolves, edited fee (12), fee note (false) and English disclaimer are kept, `disclaimer_vi` keeps its seeded text, 5 rows remain, the deleted `data_version` is re-created as `1` while the edits stay, and there are still 5 rows.
- No sleeps, no selectors, no browser. It touches only its own file and uses the shared fake D1 and migrations helper read-only.
- Non-blocking nit: the `data_version` default is read from the pre-delete map as a precondition. That is fine and needs no change.

## Questions
<!-- Q: ...   A: ... -->
