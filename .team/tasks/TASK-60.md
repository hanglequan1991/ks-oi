# TASK-60: Update older tests for migration 0003 (sync tables, sixth setting)

- id: TASK-60
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-45 (done)
- size: fits a 100k-token context (six small test edits, no source change)

Context: migration `sheet-rag/migrations/0003_sync.sql` (TASK-45) added tables `sync_state` and `sync_runs` and the setting `sync_auto_publish = 'true'`. Older tests assumed the original table list and exactly five settings. Test files only; no source or migration changes. Keep every other assertion.

## Acceptance criteria
1. AC1: `test/db/apiSample.spec.ts` ('keeps the default settings from the migration') expects 6 settings and also asserts `map.sync_auto_publish === "true"`.
2. AC2: `e2e/TC-1.e2e.ts`: the out-of-scope check no longer forbids `sync_` (prefixes become `["crawl_", "admin_"]`), and the test asserts `sync_state` and `sync_runs` exist (and that no table other than the required nine, `sync_state`, `sync_runs` starts with `crawl_`/`admin_`). Update the comment "Version 1 has no sync tables" wording accordingly.
3. AC3: `e2e/TC-2.e2e.ts`: `SETTINGS_KEYS` gains `sync_auto_publish`; the two `toHaveLength(5)` become 6; the before/after equality and per-table snapshot stay.
4. AC4: `e2e/TC-3.e2e.ts`: both `settingsCount` expectations (and the "5 rows" message) become 6.
5. AC5: `e2e/TC-4.e2e.ts`: `EXPECTED_KEYS` is the sorted six keys (`data_version`, `disclaimer_en`, `disclaimer_vi`, `service_fee_percent`, `show_fee_note`, `sync_auto_publish`); the comment says Version 1 keys plus the sync switch. It also asserts the value of `sync_auto_publish` is `'true'`.
6. AC6: the unit command and the e2e specs TC-1..TC-4 pass; no other test file changed.

Checked and NOT affected (no change needed): `test/migrations/0002_seed_settings.spec.ts` (applies only 0001+0002, its own counts of 5 stay valid), `test/fakes/migrations.spec.ts` (counts tables only on an empty dir and checks `settings` exists), `test/db/settings.spec.ts`, `test/db/*` other specs, `test/web/**`, `e2e/TC-5..TC-18` (counts are on hotels, rooms, booking_rules, cities, not on settings or sqlite_master), `test/migrations/0003_sync.spec.ts` (TASK-45).

## Unit tests to write
- [ ] `keeps the default settings from the migration` (existing, updated): covers AC1
- [ ] TC-1 e2e (existing, updated): covers AC2
- [ ] TC-2 e2e (existing, updated): covers AC3
- [ ] TC-3 e2e (existing, updated): covers AC4
- [ ] TC-4 e2e (existing, updated): covers AC5
- [ ] run of all of the above: covers AC6

## Files this task may touch
- `sheet-rag/test/db/apiSample.spec.ts`
- `sheet-rag/e2e/TC-1.e2e.ts`
- `sheet-rag/e2e/TC-2.e2e.ts`
- `sheet-rag/e2e/TC-3.e2e.ts`
- `sheet-rag/e2e/TC-4.e2e.ts`

For qalead (NOT in the dev list; qalead owns them): `.team/testcases/TC-1.md` (expected results 4 and 5 and the out-of-scope check: `sync_state`/`sync_runs` now exist), `TC-2.md` (settings has 6 rows incl. `sync_auto_publish`, expected results 3 and 5), `TC-3.md` (still 6 rows, expected results 4 and 5 and the review notes), `TC-4.md` (expected result 5: exact keys now include `sync_auto_publish`).

## Dev notes
- Red: apiSample (count 6 vs 5) and TC-1..TC-4 failed on the stale schema as expected.
- Green: unit suite 52 files / 372 tests passed; TC-1..TC-4 chromium 4 passed.
- Edits: apiSample (6 settings, sync_auto_publish), TC-1 (sync_state/sync_runs exist; prefixes crawl_/admin_; non-required non-sync tables checked), TC-2 (SETTINGS_KEYS + 6 counts), TC-3 (6 rows), TC-4 (EXPECTED_KEYS of six).

## Review

Verdict: rework (2026-11-19). AC1-AC4 and AC6 are met (apiSample, TC-1, TC-2, TC-3 correct; unit and e2e green).
1. AC5 not fully done: `e2e/TC-4.e2e.ts` must also assert that the value of `sync_auto_publish` is `'true'` (add `expect(await settingValue(db, "sync_auto_publish")).toBe("true")` near the other value checks). Also fix the step 5 comment, which still says the table holds exactly the Version 1 keys; it should say Version 1 keys plus the sync switch.
No other changes needed. Only TC-4.e2e.ts is to be touched.

## Questions
