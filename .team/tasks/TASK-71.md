# TASK-71: Wire limits, counting wrappers and breaker into site.ts; config vars; pause and tuning docs

- id: TASK-71
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 2
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
- Red first: new tests failed (no `syncDepsFor` export, no limits/budget, no vars, no doc headings). Then green.
- `src/site.ts`: `syncDepsFor(db, env)` exported; one budget per call; `db` wrapped by `countingDb`; source fetch is `countingFetch(...)` over `(...a) => globalThis.fetch(...a)` (no detached reference). `limits`, `budget`, `nowMs` added to deps. scheduled and manual route unchanged in behaviour.
- `wrangler.hotel.jsonc`: vars `MAX_TABS_PER_RUN "25"`, `SUBREQUEST_BUDGET "40"`; cron `0 * * * *` kept; SKIP_TABS and cron comments updated; placeholders kept.
- `DEPLOY-hotel-dictionary.md`: added `## Limits`, `## Pause the sync`, `## Run notes` (cause codes with meaning and action), a skip-list "owner to confirm" section, and a migration-order warning under step 3. Corrected the `?force=1` line (it re-applies the next batch only).
- Tests: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` 71 files, 606 tests passed. Playwright node chromium 32 passed. Dry-run OK (bindings DB, ASSETS, DRIVE_FOLDER_ID, SKIP_TABS, MAX_TABS_PER_RUN, SUBREQUEST_BUDGET).
- Not touched (out of file list): `src/db/syncState.ts` (comment near TAB_CHECK_META_SQL), `migrations/0004_sync_budget.sql`.
- Note: the `listing_incomplete` row in the doc describes it as info only; that is from runSync.ts (`kind: "info"`).
- Rework 1 (doc only, `DEPLOY-hotel-dictionary.md`): (1) Limits: plan-limit warning for SUBREQUEST_BUDGET (Free 50, Paid 1000; platform "Too many subrequests" = `csv_subrequest_limit`) and MAX_TABS_PER_RUN rule from TAB_RESERVE 8 (3 fetch tries + 5 D1 calls) plus LIST_RESERVE 6 + FINISH_RESERVE 2 = 8. Idle cost from the TASK-73 idle-run tests in `test/sync/runSyncReadSkip.spec.ts`: 1 fetch, at most 8 D1 calls up to 50 tabs, 7 + ceil(tabs/50) above. (2) `csv_subrequest_limit` row now describes the runtime error (fetchErrors.ts `subrequest_limit`); `aborted_circuit_breaker` row lists the immediate causes (IMMEDIATE_CAUSES in runSync.ts). Other rows re-checked against fetchErrors.ts: unchanged. (3) New "## Deploy order (every deploy)" section, five steps as listed; placed after the first-time Steps so the existing order test still holds; Sheet sync step 2 points to it.
- Open point for lead: by the TAB_RESERVE rule the Free defaults (25 tabs, budget 40) and the Paid example (200 tabs, budget 1000) are budget-bound, so the "about 18 runs" figure is a cap-only estimate. The doc now says so; the example values from AC5/AC6 are kept.
- Tests after rework: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` 71 files, 606 tests passed.
- Rework 2 (doc "Limits" plus one test assertion): replaced the "about 18 hourly runs" paragraph with labelled estimates (assumptions stated; Free: about 3 tabs per run, about 150 runs, about 6 days; unchanged tabs about 14 per run; cap 25 unreachable on Free, needs 208; Paid 1000/200: about 163 tabs per run, 3 runs). Only one "18" figure existed in the doc (grep checked). Constants checked against code: TAB_FETCH_TRIES 3, TAB_APPLY_CALLS 5, TAB_RESERVE 8, FINISH_RESERVE 2, LIST_RESERVE 6, DEFAULT_SUBREQUEST_BUDGET 40, DEFAULT_MAX_TABS_PER_RUN 25, budget cap 1000, tab cap 500. All match the brief, no difference.
- Test change: `test/web/site-config.spec.ts` asserted `toContain("18")` on the doc, which pinned the old figure. Changed only that line to `toContain("about 150 hourly runs")`.
- Tests after rework 2: `env -u CLOUDFLARE_API_TOKEN npm test -- --run` 71 files, 606 tests passed.

## Review
<!-- Written by lead. -->
Verdict: rework (doc only; code, config and tests are fine).

Verified: npm test 71 files / 606 passed; playwright 32 passed; wrangler dry-run OK with the 6 vars. site.ts: one budget per syncDepsFor call (scheduled and manual both go through it), countingDb and countingFetch over a `globalThis.fetch` arrow, source gets the wrapped fetch, parseRunLimits defaults 25/40, nowMs passed (runSync builds the deadline from it, soft 8 / hard 10 min), no secrets or folder id logged, only listed files changed. wrangler.hotel.jsonc: placeholders kept, cron hourly, SKIP_TABS comment describes both forms. Migration 0004 is all CREATE TABLE IF NOT EXISTS, so it is idempotent and safe on a live DB with 0001-0003. Cause codes list matches src/sync/fetchErrors.ts and runSync. Stale comments in syncState.ts and 0004 accepted as a note (0004's "never applied remotely" comment is stale if the owner already applied it; harmless).

Rework notes (DEPLOY-hotel-dictionary.md only):
1. "Limits": warn that raising `SUBREQUEST_BUDGET` above the platform limit of the owner's plan (Free 50, Paid 1000) does not help: the run would hit the platform "Too many subrequests" error (`csv_subrequest_limit`) instead of stopping cleanly at the budget. Keep the value at or below the plan limit (the code clamps at 1000). Same for `MAX_TABS_PER_RUN`: keep it in line with the budget.
2. Run notes table, `csv_subrequest_limit`: wrong meaning. fetchErrors.ts maps the Workers runtime error "Too many subrequests" to it (platform limit hit), not a Google limit response. Fix the meaning, and the action (lower `SUBREQUEST_BUDGET` to the plan limit or below).
3. Migration-order note (step 3) is vague ("only from the final version of the code") and the deploy order is not stated. Replace with the exact order for the next deploy: (1) `git pull`, (2) `npx wrangler d1 migrations apply hotel-dictionary --remote -c wrangler.hotel.jsonc` (applies 0004 for the first time; safe to re-run, only CREATE TABLE IF NOT EXISTS), (3) set `DRIVE_FOLDER_ID` in `wrangler.hotel.jsonc` vars (Sheet sync step 2 currently comes after the deploy steps; point to it), (4) `npm run build:client` if needed, then deploy. Note that deploying code before the migration would make the sync fail on the missing tables.
4. Update `test/web/site-config.spec.ts` doc assertions only if you add headings; no new heading is required.


### Re-review after rework 1
Verified: npm test re-run, 71 files / 606 passed. Rework notes 1 (plan-limit warning Free 50 / Paid 1000, line 199), 2 (`csv_subrequest_limit` row, line 222) and 3 (exact "Deploy order" section: git pull, migrations apply, DRIVE_FOLDER_ID, SYNC_TOKEN, build and deploy; migrations before deploy and folder id before deploy stated) are resolved and match the code.

Computed from runSync.ts (budget 40/1000; TAB_RESERVE 8, FINISH_RESERVE 2, so a tab starts only when remaining >= 10; idle fixed cost at 450 tabs = 1 fetch + 7 + ceil(450/50)=9 D1 = 17; a changed tab costs 1 fetch + 5 apply calls = 6):
- Free (budget 40, cap 25): 40-17 = 23 left. Tab 1 starts at 23, tab 2 at 17, tab 3 at 11, tab 4 at 5 (< 10, stops, `budget_exhausted`). So 3 tabs per run, not 25. First full pass of 450 changed tabs = 150 hourly runs (about 6 days), not 18. Best case, tabs that are only read and found unchanged (1 fetch each) get about 14 per run. Uncached file listings on the very first runs cost extra fetches, so the first pass is a little slower still.
- Paid (budget 1000, cap 200): 1000-17 = 983 left; tab n starts while 983 - 6(n-1) >= 10, so n = 163. About 163 tabs per run (cap 200 not reached). First pass = 3 runs (163 + 163 + 124), about 3 hours.

Why the doc still needs rework: the doc says "about 18 hourly runs (about 18 hours)" for the Free defaults, hedged only by "if the budget does not stop a run earlier". On the shipped defaults the budget always stops the run earlier, by a factor of about 8, so the headline figure would mislead the owner about when the site is fully filled.

Verdict: rework (second round, doc only; `DEPLOY-hotel-dictionary.md` "Limits" only):
1. Replace the "about 18 hourly runs" paragraph (line 205) with honest numbers: on the Free defaults (25 tabs, budget 40) a run processes about 3 changed tabs (the budget, not the cap, is the limit), so a 450-tab folder needs about 150 hourly runs (about 6 days) for the first pass; unchanged tabs go faster (about 14 reads per run). On Paid with budget 1000 and `MAX_TABS_PER_RUN` 200 a run processes about 163 tabs, so the first pass takes 3 runs. Keep it labelled as an estimate (assumes about 450 changed tabs, listings already cached, 5 D1 calls per applied tab).
2. Say plainly that 18 runs (25 tabs per run) is reachable only if the budget is at least 25 x 8 + 8 = 208; on the Free plan (50 subrequests) the cap of 25 tabs cannot be reached, so the owner who wants a faster first pass needs the Paid plan. Fix the same wording in the TASK-71 AC6 sentence is not needed; leave the AC as is.
3. No other change; no test change needed (the doc test asserts headings and codes only).

## Questions

### Final review (third pass, doc only)
Verdict: approve.
Verified: npm test 71 files / 606 passed. `site-config.spec.ts` is in the file list; only the one assertion changed (`toContain("about 150 hourly runs")`). Own arithmetic with TAB_RESERVE 8, FINISH_RESERVE 2, LIST_RESERVE 6, defaults 40/25, idle cost 17: Free 23 left, tabs start at 23/17/11, next at 5 (<10), so 3 tabs per run and 450/3 = 150 runs; unchanged-only tabs cost 1 each, start while remaining >= 10, so 14 per run; 25 x 8 + 8 = 208; Paid 983 left, 983 - 6(n-1) >= 10 gives n = 163, 163 + 163 + 124 = 450 in 3 runs. All doc numbers correct and labelled as estimates. Grep: no remaining "18 runs" or contradicting figure in the doc, wrangler.hotel.jsonc comments or site.ts. Code, config, tests and doc of TASK-71 are acceptable.
