# TASK-70: runSync listing cache: skip listTabs for files whose `modified` is unchanged, budget-aware listing

- id: TASK-70
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-66 (sync_files), TASK-67 (`SheetFile.modified`, `skipSignature`), TASK-69 (runSync budget and ordering)
- size: fits a 100k-token context (few files, one behaviour)

## Background
Today every run does `listFiles` plus one `listTabs` fetch per file (one per city). On a 450-tab folder that is dozens of fetches before any tab is read, and it repeats hourly although nothing changed. Goal: an idle run costs `listFiles` (1 fetch) plus D1 calls that scale with the tab count (measured after TASK-69 review): 7 fixed D1 calls (unfinished-runs read, startRun, sync_files read, getSyncState, settings read, markTabsChecked, finishRun) plus `ceil(tabs / 50)` `markTabsSeenBatch` chunk batches (TASK-66 AC6, chunks of 50), so about 16 at 450 tabs. The "about 1" in the story applies to fetches only. `last_checked_at` (table `sync_tab_checks`, TASK-66, no ALTER) means "last attempt" after TASK-69 rework 1; this task only reads it through `getSyncState` and does not change it.

Design (lead):
- Replace `listAllTabs(source)` in runSync by a new function in this file (or a small new helper in the same file, no new module): `listWithCache`.
- Step 1: `source.listFiles()` (always; fetch failure ends the run as today, nothing removed).
- Step 2: `getSyncFiles(db)` once.
- Step 3, per file in listing order: if the cache row exists, `row.modified` is non-null and equals `file.modified`, `file.modified` is defined, `row.skipSig === source.skipSignature` (both defined or both undefined), and `row.tabs` is non-null: use the cached tabs, no fetch. Otherwise call `source.listTabs(file)` if the budget can afford it (`canAfford(LIST_RESERVE)`, a constant: 3 fetches + 1 `upsertSyncFile` call + enough left for `FINISH_RESERVE`), then `upsertSyncFile` with the new modified, skipSig and tabs.
- The listing gate is `canAfford(LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE)` (decision Q2, 6 + 8 + 2 = 16): a listing is only started if one tab can still be processed afterwards, so a refused listing never strands files that were just listed. Progress per run is guaranteed.
- A file that must be listed but cannot be afforded this run: use its cached tabs if any AND `row.skipSig === source.skipSignature` (stale but better than nothing; the next run relists; with a different skip signature the cached list may contain tabs that are now skipped, so do not use it), else mark the run `listing_incomplete`: its tabs are unknown this run, so removal handling is skipped for the whole run (conservative: never hide on partial knowledge). Note `{kind:"abort", reason:"budget_exhausted"}` is NOT used here; use note `{kind:"info", reason:"listing_incomplete"}` and summary `aborted` stays unset; the run continues with the tabs it knows.
- A `listTabs` throw for a file: as today it ends the run as a failed run (`failed_run`), nothing removed. Exception: if the throw has `networkCause` of `subrequest_limit` or `illegal_invocation`, the TASK-68 breaker rule applies (abort, finish row).
- Cache rows for files that left the folder are ignored, not deleted (a later cleanup is out of scope).
- Files with `modified` undefined are always relisted (cannot prove unchanged).
- Also write back the cache only after a successful `listTabs`.

## Acceptance criteria
1. AC1: Second run with identical `modified` and skip signature makes zero `listTabs` calls (fake source counts calls) and the tab plan equals the first run's.
2. AC2: A file whose `modified` changed is relisted and its cache row updated.
3. AC3: A changed skip signature relists every file even if `modified` is unchanged.
4. AC4: `modified` undefined always relists.
5. AC5: First run with a cold cache and 10 files and a budget sized so that exactly 3 listings pass the gate (each needs 16 left): 3 files are listed and cached, 7 are `listing_incomplete`; the run still processes the tabs of the 3 listed files (at least one tab starts, the tab gate is still affordable after the refused 4th listing); no tab is hidden or marked missing; the next run lists the next files (convergence over runs).
6. AC6: When a file cannot be relisted but has a cached list with a matching skip signature, the cached tabs are used and removal logic stays valid; with a non-matching skip signature the cached tabs are NOT used and the file is `listing_incomplete`.
7. AC7: Listing cost of an idle run, `countingFetch` around fakes, all files unchanged (same `modified` and skip signature, cache warm): zero `listTabs` fetches and exactly 1 listing fetch plus one `readCsv` per picked tab (at most maxTabsPerRun); for a 450-tab fixture `listTabs` count is 0 (so no per-file fetches). Zero `readCsv` and the D1 call bounds are NOT asserted here: they belong to TASK-73 (read-skip), decision Q1.
8. AC8: A `listTabs` throw still yields a failed run with a code only; no cache row is written for that file.
9. AC9: Existing runSync listing tests stay green; any that assumed `listAllTabs` call order is updated deliberately. `listAllTabs` in `sheetSource.ts` is left in place (still exported, unused by runSync; do not edit that file).

## Unit tests to write
- [ ] `unchanged modified skips listTabs and plans identically`: covers AC1
- [ ] `changed modified relists and updates the cache`: covers AC2
- [ ] `changed skip signature relists all files`: covers AC3
- [ ] `missing modified always relists`: covers AC4
- [ ] `cold cache with small budget lists some files, defers others, hides nothing, converges`: covers AC5
- [ ] `falls back to cached tabs when relisting is unaffordable`: covers AC6
- [ ] `idle run makes zero listTabs fetches and one listing fetch`: covers AC7 (small and 450-tab fixtures)
- [ ] `listTabs failure fails the run with a code and writes no cache row`: covers AC8
- [ ] `subrequest_limit during listTabs trips the breaker and finishes the row`: covers AC8 and TASK-68

## Files this task may touch
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/test/sync/runSync.spec.ts`
- `sheet-rag/test/sync/runSyncListing.spec.ts` (new, to keep the existing spec file small)
- Shared: `runSync.ts` with TASK-68 and TASK-69 (both before). Reads `syncFiles.ts`, `budget.ts`.

## Dev notes
<!-- Written by dev. -->
- Red: `test/sync/runSyncListing.spec.ts` written first (9 tests, covering AC1-AC8 and the TASK-68 breaker case). All 9 failed before the change.
- Green: `src/sync/runSync.ts`. New `listWithCache` replaces `listAllTabs`. It uses the `sync_files` cache: unchanged `modified` and skip signature (both defined or both undefined) mean no `listTabs`. Listing is gated by `canAfford(LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE)` = 16, where `LIST_RESERVE = TAB_FETCH_TRIES + 1 + 2` = 6. A listed file is cached only after its `listTabs` succeeds. An unaffordable file uses its cached tabs only when the skip signature matches, otherwise `info/listing_incomplete` is noted and removals are skipped for the run.
- Breaker: a listing throw with `subrequest_limit` or `illegal_invocation` sets `aborted: "circuit_breaker"` and the note `aborted_circuit_breaker`. Other listing throws keep the old behaviour (`failed_run`, nothing written).
- Deviation (needs lead confirmation): the existing TASK-69 test "always finishes the run row on budget exhaustion" (limit 3) expects `aborted: budget_exhausted`. With the new gate, a refused listing with no tab budget would leave `aborted` unset. I added one check before the tab loop: if the listing is incomplete and the budget cannot afford TAB_RESERVE + FINISH_RESERVE, the run sets `budget_exhausted` and starts no tab. The normal path (complete listing, or incomplete with budget left) is unchanged. No existing test was edited.
- Removal is skipped when the listing is incomplete (in addition to the existing abort rule).
- `listAllTabs` in `sheetSource.ts` is untouched and no longer imported by runSync.
- Results: `runSyncListing.spec.ts` 9/9, `runSync.spec.ts` all green (TASK-54/68/69 and AC9), full suite `npm test -- --run` 566/566 in 70 files.
- AC7 is applied as agreed (A1): zero `listTabs` on idle runs, one listing fetch, `readCsv` per picked tab unchanged. Read-skip is TASK-73.
- Caveat: the AC5 convergence test uses 4 start-up D1/source calls before the first listing (unfinished-run read, startRun, listFiles, sync_files read). The budget of 24 gives exactly 3 listings, as specified.
- Status left at in-progress. Not set to review or done.

## Review
<!-- Written by lead. -->
- Verdict: approve (lead, 2026-11-19).
- Re-ran: `npm test -- --run` 70 files / 566 passed; Playwright chromium 32 passed. AC9: runSync.spec.ts untouched and green.
- Covers AC1-AC8 (9 tests in runSyncListing.spec.ts). Code matches the design: gate LIST_RESERVE+TAB_RESERVE+FINISH_RESERVE, null modified never unchanged, cached fallback only with matching skip_sig else listing_incomplete (removals skipped), listTabs throw is failed_run with breaker causes adding circuit_breaker, cache row written only after a successful listTabs of that file.
- Deviation confirmed as correct: the pre-loop budget_exhausted check applies only when the listing is incomplete AND TAB_RESERVE+FINISH_RESERVE (10) is unaffordable, which can happen because the gate (16) refuses at any budget below 16. It does not contradict A2 (a refused listing leaves room for a tab only when the budget was at or above 10) nor AC5 (budget 24 case still processes tabs). A complete listing with a tiny budget never reaches this check and is handled by the existing per-tab gate, as before.

## Questions
(Answered by lead, status restored to todo.)

1. AC7 (zero readCsv on an idle run) conflicts with the current hash check. runSync reads every picked tab each run (up to maxTabsPerRun), so an idle 50-tab run costs 25 readCsv fetches. Which do you want: (a) skip readCsv for tabs of files whose modified and skip signature are unchanged and whose state is clean (then a PARSER_VERSION change must be handled, e.g. a stored parser version), or (b) relax AC7 to zero listTabs with readCsv bounded by maxTabsPerRun? (technical, to lead)
2. AC5 (budget) conflicts with the gates: listing needs canAfford(LIST_RESERVE = 6), tabs need canAfford(10). When the 4th listing is refused, fewer than 10 remain, so none of the 3 listed files' tabs are processed. Which do you want: (a) listing also reserves one tab's worst case (LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE), or (b) AC5 asserts processing only when the tab gate allows? (technical, to lead)
A1: Option (a), but split out. The read-skip needs two stored fields per tab, so it is now TASK-72 (migration 0004 amendment: `file_modified`, `parser_version` on `sync_tab_checks`; syncState and syncHotel helpers) plus TASK-73 (runSync read-skip, after this task). A tab's read is skipped when the file `modified` is non-null and equals the one stored at the tab's last successful check, parser version is current, state is clean (no last_error, not missing, hash present), `last_checked_at` is younger than 7 days (guards a coarse opaque `modified` text), and not force. This task keeps reading picked tabs as today; its AC7 is reduced to listTabs and listing-fetch counts. Scope change for this task: AC7 reduced, no storage work here, file list unchanged. TASK-70 no longer depends on anything new and can run in parallel with TASK-72.

A2: Option (a). The listing gate is `canAfford(LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE)` (16), so a refused listing always leaves room for one tab; AC5 updated (budget sized so exactly 3 listings pass the gate).

Confirmed: (1) cached fallback (unaffordable relist) is used only when the stored skip_sig equals the current one, else `listing_incomplete`. (2) A `listTabs` throw with `networkCause` `subrequest_limit` or `illegal_invocation` sets summary `aborted: "circuit_breaker"`, the note `{kind:"abort", reason:"aborted_circuit_breaker"}` and `failed_run`; any other throw is `failed_run` only; neither writes a cache row for that file, and nothing is marked removed.
