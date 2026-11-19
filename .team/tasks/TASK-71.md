# TASK-71: Wire limits, counting wrappers and breaker into site.ts; config vars; pause and tuning docs

- id: TASK-71
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-64 (doc), TASK-65, TASK-69, TASK-70, TASK-72, TASK-73 (and transitively 63, 66, 67, 68)
- size: fits a 100k-token context (few files, one behaviour)

## Background
Everything built so far is injectable; this task connects it to the real Worker and documents operation. It also covers the temporary-safety requirement: keep the hourly cron (the budget and breaker now protect against a stuck run repeating forever) and document how to pause.

## Acceptance criteria
1. AC1: `SiteEnv` in `site.ts` gains optional `MAX_TABS_PER_RUN?: string` and `SUBREQUEST_BUDGET?: string`. `syncDepsFor` builds one `createSubrequestBudget(limits.subrequestBudget)` per call, wraps `db` with `countingDb` and the source's `fetchFn` with `countingFetch(fetch, budget)` (bound correctly: pass `fetch` as a function that calls `globalThis.fetch(...)`, never a detached reference, because a detached `fetch` throws "Illegal invocation"), and passes `limits`, `budget` and `nowMs` into `SyncDeps`.
2. AC2: `createPublicGoogleSource` is given that wrapped fetch; the Worker still has one budget per invocation (manual route and scheduled handler each build their own).
3. AC3: Unset or invalid vars give the defaults 25 and 40 (via `parseRunLimits`).
4. AC4: `scheduled` and the manual route keep never throwing out of the handler and still skip on unset, blank or placeholder `DRIVE_FOLDER_ID` and bad `SKIP_TABS`.
5. AC5: `wrangler.hotel.jsonc` `vars` gains `"MAX_TABS_PER_RUN": "25"` and `"SUBREQUEST_BUDGET": "40"` with a comment (Free defaults; on Paid the owner may raise, for example 1000 and 200), keeps `"SKIP_TABS": "[]"`, and keeps `triggers.crons` as `["0 * * * *"]` with a comment that the budget, circuit breaker and stale-run abandon protect against a stuck run repeating.
6. AC6: `DEPLOY-hotel-dictionary.md` gains: (a) a "Limits" section explaining MAX_TABS_PER_RUN and SUBREQUEST_BUDGET, Free 50 versus Paid 1000 subrequests, that a 450-tab folder converges over several hourly runs (for example 18 runs at 25 tabs), and that `?force=1` re-applies only the next batch; (b) a "Pause the sync" section: comment out `triggers.crons` (or set it to `[]`) in `wrangler.hotel.jsonc` and redeploy; the manual route stays available; (c) how to read run notes: cause codes (`csv_subrequest_limit`, `csv_illegal_invocation`, `csv_timeout`, `csv_redirect_error`, `csv_network_other`, `aborted_circuit_breaker`, `budget_exhausted`, `deadline`, `abandoned`, `listing_incomplete`) with one line of meaning and action each; (d) a note that the skip list recommendation from TASK-64 is the owner's to confirm.
7. AC7: A test reads `site.ts` behaviour with a fake env: the deps handed to `runSync` carry the parsed limits, and a `fetch` call through the source increments the budget (use the existing seams in `siteSync.spec.tsx`; stub `globalThis.fetch`).
8. AC8: A test asserts the wrapped fetch is invoked with `globalThis` as receiver safe (calling the wrapper does not throw "Illegal invocation" when `globalThis.fetch` is a stub that checks `this`).
9. AC9: Existing `site.spec.tsx`, `site-config.spec.ts`, `siteSync.spec.tsx` stay green; any pin on `wrangler.hotel.jsonc` vars is updated deliberately. No real folder id or secret in the config.

## Unit tests to write
- [ ] `syncDepsFor passes parsed limits and a shared budget`: covers AC1, AC3
- [ ] `fetch through the source spends budget`: covers AC2, AC7
- [ ] `db calls through the deps spend budget`: covers AC1
- [ ] `wrapped fetch keeps a safe receiver`: covers AC8
- [ ] `scheduled and manual still skip on unconfigured folder id and never throw`: covers AC4
- [ ] `wrangler.hotel.jsonc has the new vars, the hourly cron and no real ids`: covers AC5, AC9 (`site-config.spec.ts` style)
- [ ] `deploy doc has Limits, Pause the sync and the cause code list`: covers AC6 (reads the doc with `node:fs`; asserts headings and every code string)

## Files this task may touch
- `sheet-rag/src/site.ts`
- `sheet-rag/wrangler.hotel.jsonc`
- `sheet-rag/DEPLOY-hotel-dictionary.md`
- `sheet-rag/test/web/siteSync.spec.tsx`
- `sheet-rag/test/web/site-config.spec.ts`
- `sheet-rag/test/web/site.spec.tsx` (only if an existing assertion needs the new vars)
- Shared: `DEPLOY-hotel-dictionary.md` with TASK-64 (before). `src/site.ts` is touched by no other task in this fix.

## Dev notes
<!-- Written by dev. -->

## Review
<!-- Written by lead. -->

## Questions
