# TASK-70: runSync listing cache: skip listTabs for files whose `modified` is unchanged, budget-aware listing

- id: TASK-70
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
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
- Dev stopped before writing code. Read runSync.ts, syncFiles.ts (getSyncFiles, upsertSyncFile), syncState.ts, planSync.ts, budget.ts, the fakes and runSync.spec.ts. No files changed.
- Conflict 1 (AC7 zero readCsv): runSync reads (hashes) every picked tab each run (`source.readCsv` per tab, up to maxTabsPerRun = 25) because change detection is by content hash. An idle run with 25+ tabs therefore costs 25 readCsv fetches, not zero. The TASK-69 tests (rotation, `reads` of 25 per run) also depend on picked tabs being read. Zero readCsv needs either (a) skipping reads of tabs in files whose modified and skip signature are unchanged and whose state is clean (no hash change expected, no last_error, not missing, not force). That skips detection of a PARSER_VERSION change (the hash includes it), so it needs a stored parser version or a documented exception; or (b) relaxing AC7 to "zero listTabs, readCsv only for picked tabs (at most maxTabsPerRun)".
- Conflict 2 (AC5 budget): the listing gate is canAfford(LIST_RESERVE = 6) and the tab gate is canAfford(TAB_RESERVE + FINISH_RESERVE = 10). If the budget refuses the 4th listing, fewer than 6 remain, so fewer than 10 remain for the tab loop and none of the 3 listed files' tabs start (budget_exhausted). AC5 ("the run still processes the tabs of the 3 listed files") cannot hold with this gate. Options: (a) listing gate also reserves one tab (LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE) and AC5 uses a budget sized for it; or (b) AC5 only asserts that listed files' tabs are processed when the tab gate allows.
- Smaller points to confirm with the answer: a cached fallback (AC6, unaffordable relist) should only be used when the stored skip_sig equals the current one (else a newly skipped tab could be applied); a listTabs throw with subrequest_limit/illegal_invocation sets summary aborted "circuit_breaker" and the abort note with failed_run.

## Review
<!-- Written by lead. -->

## Questions
(Answered by lead, status restored to todo.)

1. AC7 (zero readCsv on an idle run) conflicts with the current hash check. runSync reads every picked tab each run (up to maxTabsPerRun), so an idle 50-tab run costs 25 readCsv fetches. Which do you want: (a) skip readCsv for tabs of files whose modified and skip signature are unchanged and whose state is clean (then a PARSER_VERSION change must be handled, e.g. a stored parser version), or (b) relax AC7 to zero listTabs with readCsv bounded by maxTabsPerRun? (technical, to lead)
2. AC5 (budget) conflicts with the gates: listing needs canAfford(LIST_RESERVE = 6), tabs need canAfford(10). When the 4th listing is refused, fewer than 10 remain, so none of the 3 listed files' tabs are processed. Which do you want: (a) listing also reserves one tab's worst case (LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE), or (b) AC5 asserts processing only when the tab gate allows? (technical, to lead)
A1: Option (a), but split out. The read-skip needs two stored fields per tab, so it is now TASK-72 (migration 0004 amendment: `file_modified`, `parser_version` on `sync_tab_checks`; syncState and syncHotel helpers) plus TASK-73 (runSync read-skip, after this task). A tab's read is skipped when the file `modified` is non-null and equals the one stored at the tab's last successful check, parser version is current, state is clean (no last_error, not missing, hash present), `last_checked_at` is younger than 7 days (guards a coarse opaque `modified` text), and not force. This task keeps reading picked tabs as today; its AC7 is reduced to listTabs and listing-fetch counts. Scope change for this task: AC7 reduced, no storage work here, file list unchanged. TASK-70 no longer depends on anything new and can run in parallel with TASK-72.

A2: Option (a). The listing gate is `canAfford(LIST_RESERVE + TAB_RESERVE + FINISH_RESERVE)` (16), so a refused listing always leaves room for one tab; AC5 updated (budget sized so exactly 3 listings pass the gate).

Confirmed: (1) cached fallback (unaffordable relist) is used only when the stored skip_sig equals the current one, else `listing_incomplete`. (2) A `listTabs` throw with `networkCause` `subrequest_limit` or `illegal_invocation` sets summary `aborted: "circuit_breaker"`, the note `{kind:"abort", reason:"aborted_circuit_breaker"}` and `failed_run`; any other throw is `failed_run` only; neither writes a cache row for that file, and nothing is marked removed.
