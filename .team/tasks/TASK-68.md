# TASK-68: runSync safety: stale-run abandon, wall-clock stop, circuit breaker on repeated network failure

- id: TASK-68
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-63 (needs `SheetReadError.networkCause`), TASK-65 (`createDeadline`)
- size: fits a 100k-token context (few files, one behaviour)

## Background
Run 8c9c0f81 (scheduled, 06:00:49Z) still has `finished_at` NULL while manual run 97433cc4 (05:40) ran 27 minutes and failed 451 tabs one after another. Needed: (B) stop hammering, (E) no orphaned runs, no overlapping runs.

Decisions (lead):
- Stale run: unfinished and `started_at` older than 15 minutes (`STALE_RUN_MS`, existing). The next run marks it finished with `finished_at = now`, notes `{kind:"abandoned", reason:"abandoned"}` and `failed` unchanged. (The sync_runs table has no status column; "error/abandoned" is encoded as the note item `kind: "error"`, `reason: "abandoned"`.) Done in a new `abandonRun(db, id, now)` in `syncRuns.ts`.
- A recent unfinished run (< 15 min) still blocks with `skipped: "already_running"`, as today.
- Wall clock: `SyncDeps` gains optional `nowMs?: () => number` (default `Date.now`). The run builds `createDeadline(start, nowMs)`. Before each tab read: if `softExceeded()` (8 min) stop starting tabs, note `{kind:"abort", reason:"deadline"}` and finish normally (counts so far are saved). `hardExceeded()` (10 min) is checked too, same effect; both finish the row so it never stays NULL.
- Circuit breaker: constant `BREAKER_THRESHOLD = 5`. Count consecutive tab reads that failed with the same `networkCause` (a success, an HTTP-status failure, a parse failure, or a different cause resets the streak). At 5, stop reading further tabs, note `{kind:"abort", reason:"aborted_circuit_breaker"}`, add summary field `aborted: "circuit_breaker"`, finish the row normally. Nothing is hidden when the run aborted early (removal needs a complete listing; the listing finished, but be conservative: skip `plan.removed` handling when `aborted` is set).
- AC9 stays: summary and notes carry only counts and codes.

## Acceptance criteria
1. AC1: A run whose newest unfinished predecessor is older than 15 minutes marks that predecessor finished with note `kind:"error"`, `reason:"abandoned"` and then proceeds. Every abandoned run is handled (not only the newest).
2. AC2: A predecessor younger than 15 minutes still returns `skipped: "already_running"` and writes no row.
3. AC3: `abandonRun` only updates rows that are still unfinished (a finished row is never overwritten).
4. AC4: After the soft deadline, no new tab is read; the run row is finished (`finished_at` set), the note has `abort`/`deadline`, and the summary field `aborted: "deadline"` is set.
5. AC5: Five consecutive `readCsv` failures with the same `networkCause` stop the run: the 6th tab is never read, the note has `abort`/`aborted_circuit_breaker`, summary `aborted: "circuit_breaker"`, and the 5 failures are recorded.
6. AC6: The streak resets on success, on an HTTP-status failure (no networkCause) and on a different cause; 4 failures + 1 success + 4 failures does not trip.
7. AC7: A `subrequest_limit` failure trips the breaker at once (threshold 1 for `subrequest_limit` and `illegal_invocation`, since retrying is pointless).
8. AC8: After an early abort, no tab is hidden or marked missing, and `plan.removed` is not applied.
9. AC9: `SyncSummary` gains optional `aborted?: "circuit_breaker" | "deadline"`; failures and notes still contain only codes (test asserts no `http`, no `://`).
10. AC10: Existing runSync behaviour tests stay green. Any test pinning `csv_network` is updated deliberately (TASK-63 retired it).

## Unit tests to write
- [ ] `abandons a stale unfinished run older than 15 minutes and proceeds`: covers AC1, AC3
- [ ] `abandons several stale runs`: covers AC1
- [ ] `recent unfinished run still skips with already_running`: covers AC2
- [ ] `abandonRun does not overwrite a finished row` (in `test/db/syncRuns.spec.ts`): covers AC3
- [ ] `stops starting tabs after the soft deadline and finishes the row`: covers AC4 (injected `nowMs`)
- [ ] `five consecutive same-cause network failures trip the breaker`: covers AC5
- [ ] `streak resets on success, http failure and different cause`: covers AC6
- [ ] `subrequest_limit trips the breaker on the first failure`: covers AC7
- [ ] `early abort hides nothing`: covers AC8
- [ ] `summary and notes contain only codes after an abort`: covers AC9

## Files this task may touch
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/src/db/syncRuns.ts`
- `sheet-rag/test/sync/runSync.spec.ts`
- `sheet-rag/test/db/syncRuns.spec.ts`
- Shared: `runSync.ts` is also edited by TASK-69 and TASK-70, which run after this task.

## Dev notes
<!-- Written by dev. -->
- Red: 9 new tests failed for the right reasons (no abandonRun, stale run not abandoned, no breaker, no deadline).
- Green: `abandonRun` in syncRuns.ts (updates only rows with finished_at NULL, note `{kind:"error", reason:"abandoned"}`, counts kept). runSync.ts: `blockedByRecentRun` (a recent run blocks with no writes, otherwise every stale run is abandoned), `createDeadline` with injected `nowMs`, circuit breaker (BREAKER_THRESHOLD 5, threshold 1 for subrequest_limit and illegal_invocation), `aborted` on the summary, and `plan.removed` skipped when aborted.
- Refactor: renamed hasRecentUnfinishedRun to blockedByRecentRun. Re-ran the tests after the rename.
- Tests: `npm test -- --run test/sync/runSync.spec.ts test/db/syncRuns.spec.ts` gives 31 passed. `npm test -- --run test/sync test/db` gives 24 files and 205 tests passed.
- Files changed: sheet-rag/src/sync/runSync.ts, sheet-rag/src/db/syncRuns.ts, sheet-rag/test/sync/runSync.spec.ts, sheet-rag/test/db/syncRuns.spec.ts.

## Review
Verdict: approve (lead, 2026-11-19).
- Concurrency guard vs the 06:00 orphan: `blockedByRecentRun` reads `finished_at IS NULL` rows; if any has `started_at` newer than now - 15 min it blocks with no writes (test: 14 min old still skips, row stays NULL). Otherwise every stale row is abandoned (`abandonRun`, `WHERE finished_at IS NULL`, note error/abandoned, counts kept) and the run proceeds (tests: one stale at 09:30 vs now 10:00, and several). So an orphan older than 15 minutes is closed by the next run and a younger one still blocks.
- Known minor limitation, not a defect: if a recent run and a stale one coexist, the stale one stays open until the next run after the recent one ends.
- Deadline: soft or hard exceeded stops before the next read, note abort/deadline, summary aborted "deadline", row finished (injected nowMs, 9 and 11 min tested).
- Breaker: threshold 5 same networkCause, streak reset by success, HTTP/no-cause failure and a different cause; 1 for subrequest_limit and illegal_invocation; note abort/aborted_circuit_breaker, summary aborted "circuit_breaker".
- After an early abort `plan.removed` is skipped, unread tabs stay listed (never removed, `csv === undefined` is skipped), tested with a vanished tab staying published.
- AC9: the hostile fixture (URL plus token in the error message) is run through the breaker path; summary and notes contain only codes. Existing csv_network assertions were handled; suite 532 green.
- Only the four listed files changed.

## Questions
