# TASK-69: runSync budgeted resumable processing: per-run tab cap, oldest-first, subrequest budget, batched seen marks

- id: TASK-69
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
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
6. AC6: Unchanged tabs get `last_checked_at` updated through one `markTabsChecked` batch call; an unreadable tab does not.
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
- [ ] `unchanged tabs refresh last_checked_at in one batch, unreadable tabs do not`: covers AC6
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

## Review
<!-- Written by lead. -->

## Questions
