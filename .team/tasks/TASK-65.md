# TASK-65: Run limits, subrequest budget counter, counting D1 wrapper and counting fetch

- id: TASK-65
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-54, TASK-56, TASK-62 (all done). No file overlap with TASK-63 or TASK-66, so it can run in parallel with them.
- size: fits a 100k-token context (few files, one behaviour)

## Background
A Worker invocation may make at most 50 (Free) or 1000 (Paid) subrequests; fetch calls and binding calls such as D1 count. The run must count them itself and stop cleanly before the platform kills it. This task builds only the counting pieces as pure, injectable code (no Cloudflare imports); TASK-69 and TASK-71 use them.

## Acceptance criteria
1. AC1: New `sheet-rag/src/sync/budget.ts` exports `DEFAULT_SUBREQUEST_BUDGET = 40`, `DEFAULT_MAX_TABS_PER_RUN = 25`, `type RunLimits = { subrequestBudget: number; maxTabsPerRun: number }`, and `parseRunLimits(env: { SUBREQUEST_BUDGET?: string; MAX_TABS_PER_RUN?: string }): RunLimits`. Unset, blank, non-numeric, non-integer, zero or negative values give the default. Values are capped at 1000 (budget) and 500 (tabs). No throw.
2. AC2: `createSubrequestBudget(limit: number)` returns an object with `spend(n = 1): void`, `used: number`, `remaining: number` (never below 0), `canAfford(n: number): boolean` (true when `remaining >= n`), and `exhausted: boolean` (remaining is 0). `spend` never throws, even past the limit (the counter keeps counting so the report is honest).
3. AC3: `countingFetch(fetchFn: typeof fetch, budget): typeof fetch` spends 1 per call before delegating (also when the call then throws) and returns or rethrows the original outcome unchanged.
4. AC4: New `sheet-rag/src/sync/countingDb.ts` exports `countingDb(db: D1Database, budget): D1Database`. It spends 1 for every `run`, `first`, `all` and `raw` call on a prepared statement, and 1 for each `db.batch([...])` call regardless of the number of statements (one binding call). `prepare`, `bind` and the other methods pass through with results unchanged, and `bind` returns a wrapped statement so chaining `prepare(..).bind(..).run()` is counted once. `exec` and `dump` spend 1 each.
5. AC5: The wrapper does not change what a statement returns or throws (results and errors are identical to the unwrapped fake).
6. AC6: Wall-clock helper `createDeadline(startMs: number, nowMs: () => number, opts?: { softMs?: number; hardMs?: number })` with defaults soft 8 minutes (stop starting new tabs) and hard 10 minutes. It returns `{ elapsedMs(): number; softExceeded(): boolean; hardExceeded(): boolean }`. Pure; time is injected.
7. AC7: No file in this task imports from `cloudflare:*` or `@cloudflare/*` at runtime (types only).

## Unit tests to write
- [ ] `parseRunLimits returns defaults when unset or blank`: covers AC1
- [ ] `parseRunLimits rejects junk, zero, negative and fractional values`: covers AC1
- [ ] `parseRunLimits accepts valid values and caps them`: covers AC1
- [ ] `budget counts spend, remaining never below zero, canAfford and exhausted`: covers AC2
- [ ] `budget keeps counting past the limit without throwing`: covers AC2
- [ ] `countingFetch spends once per call including failing calls and passes results through`: covers AC3
- [ ] `countingDb counts run, first, all, raw once each`: covers AC4 (uses `test/fakes/d1.ts`)
- [ ] `countingDb counts a batch of several statements as one`: covers AC4
- [ ] `countingDb returns the same results and rethrows the same errors`: covers AC5
- [ ] `deadline reports soft at 8 minutes and hard at 10 minutes with injected clock`: covers AC6

## Files this task may touch
- `sheet-rag/src/sync/budget.ts` (new)
- `sheet-rag/src/sync/countingDb.ts` (new)
- `sheet-rag/test/sync/budget.spec.ts` (new)
- `sheet-rag/test/sync/countingDb.spec.ts` (new)
- Nothing shared with other tasks.

## Dev notes
<!-- Written by dev. -->
- Red: both new specs failed (modules missing). Green: `test/sync/budget.spec.ts` (7 tests) and `test/sync/countingDb.spec.ts` (4 tests) pass, 12/12.
- Files: `sheet-rag/src/sync/budget.ts`, `sheet-rag/src/sync/countingDb.ts`, `sheet-rag/test/sync/budget.spec.ts`, `sheet-rag/test/sync/countingDb.spec.ts`.
- Full unit run: 494 passed, 6 failed in `test/db/syncState.spec.ts` and `test/db/syncFiles.spec.ts` (TASK-66 area, not touched).
- `test/fakes/d1.ts` has no `raw`; the spec adds it locally. `duration` in the fake's meta is compared out.

## Review
<!-- Written by lead. -->

## Questions
