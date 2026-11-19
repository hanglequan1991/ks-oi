# TASK-69: runSync budgeted resumable processing: per-run tab cap, oldest-first, subrequest budget, batched seen marks

- id: TASK-69
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 1
- depends on: TASK-65 (budget, limits, countingDb), TASK-66 (last_checked_at, markTabsSeenBatch, markTabsChecked, pickOldestFirst), TASK-68 (same runSync.ts; abort fields)
- size: fits a 100k-token context (few files, one behaviour; if the dev finds it too large, report back instead of widening scope)

## Background
A folder of 450+ tabs cannot be done in one invocation (50 or 1000 subrequests). Each run must do a bounded amount of work and the next cron tick continues. Today runSync also makes one `markTabSeen` D1 call per listed tab (450 calls) and reads every tab; both must go.

Design (lead):
- `SyncDeps` gains optional `limits?: RunLimits` (default `{40, 25}`) and optional `budget?: SubrequestBudget`. The caller (TASK-71) wraps `db` with `countingDb` and the fetch with `countingFetch` using the same budget object; runSync reads `budget` to decide, it does not wrap anything itself, so tests can drive it with a fake budget.
- Order of a run: abandon stale runs, startRun, list (unchanged here; caching comes in TASK-70), `getSyncState`, `markTabsSeenBatch` for all listed tabs, then choose work: `pickOldestFirst(tabs, state, limits.maxTabsPerRun)`, then read/hash/apply only the picked tabs, one at a time.
- Per-tab reserve: before starting a tab, require `budget.canAfford(TAB_RESERVE)` plus `FINISH_RESERVE` for the closing `finishRun` call. Constants (exported, with a comment on how they were derived): `TAB_RESERVE` = worst-case fetches (3 tries) + the D1 calls of one apply (count them from `syncHotel`/`writeHotel`/`writeRooms`/`recordTabSuccess`; the dev measures with `countingDb` in a test and sets the constant to that maximum plus the 3 fetches), `FINISH_RESERVE` = 2. If not affordable: stop, note `{kind:"abort", reason:"budget_exhausted"}`, summary `aborted: "budget_exhausted"`, finish the row. The finish call must always happen.
- A tab whose csv hash equals the stored hash and has no error: not applied, counted `unchanged`, and `markTabsChecked` batch (one call at the end, plus one for applied tabs is already done by `recordTabSuccess`).
- Tabs deferred by the cap or budget are neither unchanged, failed nor removed. Summary gains `deferred: number` (count only).
- Hiding removed tabs: runs only when the run was not aborted (same rule as TASK-68) and only for tabs absent from the full listing; deferred tabs are in the listing, so they are never treated as removed. `hideRemovedTab` D1 calls are budget-checked per removed tab (one `canAfford` check each; leftover removals wait for the next run, they stay in `plan.removed` next time).
- `force=1` re-applies the picked tabs only (still capped); the doc in TASK-71 says so.
- The old state `markTabSeen` per tab is removed from runSync.

## Acceptance criteria
1. AC1: With 60 listed tabs and `maxTabsPerRun` 25, exactly 25 tabs are read; `summary.deferred` is 35; nothing is hidden because of the deferred ones.
2. AC2: Picked tabs are the never-checked first, then oldest `last_checked_at`; a second run over the same fake picks the next 25 (convergence test: 3 runs cover 60 tabs, none twice before all were once).
3. AC3: The `markTabSeen` per-tab loop is gone: the listed tabs are marked with `markTabsSeenBatch` (D1 call count for 60 tabs is at most 2 for marking, asserted with the counting fake).
4. AC4: With a fake budget that allows only N tabs, the run stops before the platform limit: `aborted: "budget_exhausted"`, note `abort`/`budget_exhausted`, `finished_at` set, and total spend does not exceed the budget limit (assert `budget.used <= limit` with counting wrappers around the fake db and fetch).
5. AC5: `finishRun` is still called when the budget is exhausted (the reserve guarantees it).
6. AC6: Unchanged and failed tabs get their check time in one `markTabsChecked` batch; applied tabs through `recordTabSuccess`.
7. AC7: A tab applied or unchanged is not failed; counts `created/updated/unchanged/failed/hidden` keep their old meaning for the picked tabs.
8. AC8: `SyncSummary.deferred` is a number only (AC9 of the story: counts and codes only).
9. AC9: With no `limits` and no `budget` passed, defaults apply (25 tabs; budget unlimited when `budget` is undefined, so existing tests keep working; if an existing test lists more than 25 tabs, update it deliberately).
10. AC10: Removed-tab hiding still works for a tab truly absent from the listing, and is skipped after an abort (TASK-68 AC8).

## Unit tests to write
- [ ] `reads only maxTabsPerRun tabs and reports deferred`: covers AC1
- [ ] `three runs converge over 60 tabs oldest-first`: covers AC2
- [ ] `marks listed tabs seen with batched calls only`: covers AC3
- [ ] `stops with budget_exhausted before exceeding the budget`: covers AC4
- [ ] `always finishes the run row on budget exhaustion`: covers AC5
- [ ] `unchanged and failed tabs refresh the check time in one batch`: covers AC6
- [ ] `permanently failing tabs rotate and do not starve the rest`: covers AC2, AC6
- [ ] `a failed tab keeps its stored hash and only its check time moves`: covers AC6
- [ ] `counts keep their meaning for processed tabs`: covers AC7
- [ ] `summary carries deferred as a number and no text`: covers AC8
- [ ] `defaults apply without limits or budget`: covers AC9
- [ ] `deferred tabs are never hidden, truly removed tabs are`: covers AC1, AC10
- [ ] `TAB_RESERVE matches the measured worst case of one applied tab`: covers AC4 (measures D1 calls with `countingDb` over a full apply of a fixture hotel; fails if `syncHotel` later grows)

## Files this task may touch
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/test/sync/runSync.spec.ts`
- Shared: `runSync.ts` with TASK-68 (before) and TASK-70 (after). Reads, does not edit, `budget.ts`, `countingDb.ts`, `syncState.ts`.

## Dev notes
<!-- Written by dev. -->
- GREEN: `runSync.spec.ts` 35/35 pass; full unit suite 69 files, 549 tests pass.
- `TAB_APPLY_CALLS = 5` is the measured maximum (TAB_RESERVE test over four syncHotel scenarios). `TAB_RESERVE = 3 + 5 = 8`. `FINISH_RESERVE = 2`.
- Per-tab loop replaces the `markTabSeen` loop: `markTabsSeenBatch` for all listed tabs, `pickOldestFirst` with `maxTabsPerRun`, gate `canAfford(TAB_RESERVE + FINISH_RESERVE)` before each tab, `abort budget_exhausted` when it fails. `finishRun` always runs.
- Unchanged tabs go into one `markTabsChecked` batch. Unreadable tabs are not in it.
- Read failures are listed before the other failures (the existing test pins this order, as the old two-pass code did).
- Removed tabs are hidden only when the run was not aborted, with one `canAfford(HIDE_CALLS + FINISH_RESERVE)` check per removal. Deferred tabs are never removed.
- `deferred` is a count in the summary (`listed - started`).
- Not done / open: a tab whose read keeps failing has no check row, so it sorts first every run (possible starvation of the rest; needs a decision from lead). `startRun`, `getUnfinishedRuns`, `getSyncState`, the seen batches and listing are not gated by `canAfford`. A removal skipped by the budget is not reported in the summary.

Rework 1 (lead notes 1-5):
- Note 1: `attemptedKeys` collects every picked tab that ended in `fail(...)` (read failure incl. breaker path, parse failure, invalid, apply_failed). `markTabsChecked(db, [...unchangedKeys, ...attemptedKeys], now)` is still one batch, at most 25 statements (cap). Applied tabs are not added. Header and batch comments updated. `syncState.ts` untouched, hash untouched.
- Note 2: AC6 test renamed `unchanged and failed tabs refresh the check time in one batch`; tab `file-1:3` unreadable now gets LATER in a 4-statement batch. The AC6 wording in this file was not edited (dev may not touch it); lead to update the wording: "unchanged and failed tabs get their check time in one markTabsChecked batch; applied tabs through recordTabSuccess".
- Note 3: added `permanently failing tabs rotate and do not starve the rest` (read-fail and parse-fail variants over 60 tabs, cap 25, 3 runs cover all 60, run 2 does not re-read run 1's tabs, each run `failed: 25, deferred: 35`). Added `a failed tab keeps its stored hash and only its check time moves`.
- Note 4: comment on `last_checked_at` meaning "last attempt" added in `runSync.ts`. Stale comments in `syncState.ts` and migration 0004 not touched.
- Note 5: `env -u CLOUDFLARE_API_TOKEN npm test -- --run`: 69 files, 551 tests pass (was 549; +2 net: rotation and hash tests added, AC6 renamed).

## Review
<!-- Written by lead. -->
Verdict: **rework** (rework count 0 -> 1, pm applies).

Verified by lead: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` in sheet-rag: 69 files, 549 tests pass. `git diff` shows only `runSync.ts` changed in the green phase (spec came with the red commit 79f232d); no other file touched. ACs 1-10 each have a named test. AC9 (counts and codes only, `deferred` a number) OK. Cap, `pickOldestFirst`, `budget_exhausted` with reserve (TAB_RESERVE 8 = 3 fetches + 5, FINISH_RESERVE 2), single `markTabsChecked` batch, batched seen marks, removals only after a non-aborted run, deferred tabs never removed: all correct. The TAB_RESERVE test derives `TAB_APPLY_CALLS` from the real `syncHotel` through `countingDb` over four scenarios (create, update, other tab, failing batch) and asserts `toBe(Math.max(...costs))`: genuine measurement, accepted. (Parse-failure path costs 1 call via `recordTabError`, below the max.)

Defect (open item 1, STARVATION, confirmed real): `last_checked_at` is read only by `pickOldestFirst` (grep of src: no other reader; change detection uses hash and last_error in `planSync`). A tab whose read or apply keeps failing never gets a check row, sorts first forever; with the parser still a stub all 450 tabs fail and the same 25 are retried forever.

Decision: the check time becomes "last attempt" for ordering. A failed tab (read failure, parse failure, invalid, apply_failed) is upserted into `sync_tab_checks` at `now`, in the SAME end-of-run `markTabsChecked` batch as the unchanged tabs. No change to `syncState.ts`, no migration, no new task, no file-list extension: `TabKey` batch and `tabCheckStatement` already exist and work for any tab with a `sync_state` row (every listed tab has one after the seen batch). Change detection is unaffected: hash and `last_error` are untouched, so a failed tab is still retried when picked again (an unchanged hash with a recent failure is retried later, not first).

Rework notes (files: `sheet-rag/src/sync/runSync.ts`, `sheet-rag/test/sync/runSync.spec.ts` only):
1. In `runSync.ts` collect `attemptedKeys` for every picked tab that ended in `fail(...)` (read failure incl. the breaker path, parse failure, `invalid`, `apply_failed`) and pass `[...unchangedKeys, ...attemptedKeys]` to one `markTabsChecked(db, keys, now)` call. Still exactly one batch, still at most 25 statements, so FINISH_RESERVE = 2 still covers it. Applied (created/updated) tabs are not added (`syncHotel` already writes their check row). Update the header comment and the "Failed reads and applied tabs are not in it" comment.
2. Rewrite test `unchanged tabs refresh last_checked_at in one batch, unreadable tabs do not` (AC6, update the AC6 wording in this task to: "unchanged and failed tabs get their check time in one markTabsChecked batch; applied tabs through recordTabSuccess"): tab `file-1:3` unreadable now gets `LATER`, one check batch with 4 statements. Rename to e.g. `unchanged and failed tabs refresh the check time in one batch`.
3. Add test `permanently failing tabs rotate and do not starve the rest`: 60 tabs, every `readCsv` fails (and a second variant or case where parse fails for every tab, i.e. the stub parser), cap 25: three runs at increasing times read 1..25, 26..50, 51..60 plus the oldest; assert `new Set(reads.flat()).size === 60` after three runs and that run 2 does not re-read run 1's tabs. Also assert a failed tab keeps its old `hash` (retry semantics) after a failing run.
4. Add a short note to the TAB comment in `runSync.ts` that `last_checked_at` means "last attempt" for ordering. (The stale comments in `syncState.ts` lines 66-67 and in migration 0004 saying a failed tab keeps its old row are outside this task's list; do not edit them, pm may log a docs follow-up in TASK-71 which touches the wiring.)
5. Re-run the full suite and report counts.

Judgement on the other open items (no code change required):
- (2) Fixed start-up calls are not gated. Idle run at 450 tabs: unfinished-runs read 1, startRun 1, listFiles 1, sync_files read 1 (TASK-70), getSyncState 1, seen batches 9 (450 / 50 per batch, not 1), settings read 1, markTabsChecked 1, finishRun 1 = about 16 D1/fetch calls, plus 1 fetch per changed file listing. That leaves 24 of 40 (34 of 50) and the per-tab gate (10) then stops cleanly, so the reserve is sufficient and finishRun is not at risk in practice. Consequence for TASK-70 AC7 ("at most 8 counted D1 calls"): that bound only holds for at most 50 tabs; with 450 tabs the seen batches alone are 9. TASK-70 must assert its bound on a small fixture (or state "7 + number of seen chunks"); pm/lead will adjust TASK-70's text when it is dispatched. Not a TASK-69 defect.
- (3) A removal skipped by the budget stays unmarked and so stays in `plan.removed` next run (self-healing). A count is not worth a new summary field now; `removals_deferred` not added (AC9 surface kept minimal).

### Re-review (rework count 1)
Verdict: **approve**.

Verified by lead: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` in sheet-rag: 69 files, 551 tests pass. Changes are only in `runSync.ts` and `runSync.spec.ts` (task file edited by lead).
1. `attemptedKeys` is pushed on read failure (incl. breaker path), parse failure, and invalid/apply_failed; one `markTabsChecked(db, [...unchangedKeys, ...attemptedKeys], now)` call, at most 25 statements, FINISH_RESERVE 2 unchanged. Applied tabs not added. OK.
2. Hash untouched (`a failed tab keeps its stored hash...` asserts it). OK.
3. AC6 test rewritten: 4 check rows at LATER, exactly one check batch of 4 statements. OK.
4. Rotation test is meaningful: run 2 must read exactly 26..50 (would be 1..25 without the attempt marks), run 3 reads the 10 never-checked plus the 15 oldest, 60 distinct tabs after 3 runs, in both read-fail and parse-fail variants. OK.
5. "Last attempt" comment present. OK.
AC6 wording and test list in this task updated to the dev's text. No real defect found.

## Questions
