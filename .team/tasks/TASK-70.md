# TASK-70: runSync listing cache: skip listTabs for files whose `modified` is unchanged, budget-aware listing

- id: TASK-70
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: TASK-66 (sync_files), TASK-67 (`SheetFile.modified`, `skipSignature`), TASK-69 (runSync budget and ordering)
- size: fits a 100k-token context (few files, one behaviour)

## Background
Today every run does `listFiles` plus one `listTabs` fetch per file (one per city). On a 450-tab folder that is dozens of fetches before any tab is read, and it repeats hourly although nothing changed. Goal: an idle run costs `listFiles` (1 fetch) plus a handful of D1 calls (honest estimate: about 7 subrequests in total: unfinished-runs read, start, sync_state read, sync_files read, settings read, markTabsSeenBatch, finish); the "about 1" in the story applies to fetches only.

Design (lead):
- Replace `listAllTabs(source)` in runSync by a new function in this file (or a small new helper in the same file, no new module): `listWithCache`.
- Step 1: `source.listFiles()` (always; fetch failure ends the run as today, nothing removed).
- Step 2: `getSyncFiles(db)` once.
- Step 3, per file in listing order: if the cache row exists, `row.modified` is non-null and equals `file.modified`, `file.modified` is defined, `row.skipSig === source.skipSignature` (both defined or both undefined), and `row.tabs` is non-null: use the cached tabs, no fetch. Otherwise call `source.listTabs(file)` if the budget can afford it (`canAfford(LIST_RESERVE)`, a constant: 3 fetches + 1 `upsertSyncFile` call + enough left for `FINISH_RESERVE`), then `upsertSyncFile` with the new modified, skipSig and tabs.
- A file that must be listed but cannot be afforded this run: use its cached tabs if any (stale but better than nothing; the next run relists), else mark the run `listing_incomplete`: its tabs are unknown this run, so removal handling is skipped for the whole run (conservative: never hide on partial knowledge). Note `{kind:"abort", reason:"budget_exhausted"}` is NOT used here; use note `{kind:"info", reason:"listing_incomplete"}` and summary `aborted` stays unset; the run continues with the tabs it knows.
- A `listTabs` throw for a file: as today it ends the run as a failed run (`failed_run`), nothing removed. Exception: if the throw has `networkCause` of `subrequest_limit` or `illegal_invocation`, the TASK-68 breaker rule applies (abort, finish row).
- Cache rows for files that left the folder are ignored, not deleted (a later cleanup is out of scope).
- Files with `modified` undefined are always relisted (cannot prove unchanged).
- Also write back the cache only after a successful `listTabs`.

## Acceptance criteria
1. AC1: Second run with identical `modified` and skip signature makes zero `listTabs` calls (fake source counts calls) and the tab plan equals the first run's.
2. AC2: A file whose `modified` changed is relisted and its cache row updated.
3. AC3: A changed skip signature relists every file even if `modified` is unchanged.
4. AC4: `modified` undefined always relists.
5. AC5: First run with a cold cache and 10 files and a budget that affords only 3 listings: 3 files are listed and cached, 7 are `listing_incomplete`; the run still processes the tabs of the 3 listed files; no tab is hidden or marked missing; the next run lists the next files (convergence over runs).
6. AC6: When a file cannot be relisted but has a cached list, the cached tabs are used and removal logic stays valid.
7. AC7: The idle-run cost test: a run with all files unchanged and all tabs checked recently performs 1 fetch and at most 8 counted D1 calls with `countingDb`/`countingFetch` around fakes (assert the exact numbers measured, within these bounds).
8. AC8: A `listTabs` throw still yields a failed run with a code only; no cache row is written for that file.
9. AC9: Existing runSync listing tests stay green; any that assumed `listAllTabs` call order is updated deliberately. `listAllTabs` in `sheetSource.ts` is left in place (still exported, unused by runSync; do not edit that file).

## Unit tests to write
- [ ] `unchanged modified skips listTabs and plans identically`: covers AC1
- [ ] `changed modified relists and updates the cache`: covers AC2
- [ ] `changed skip signature relists all files`: covers AC3
- [ ] `missing modified always relists`: covers AC4
- [ ] `cold cache with small budget lists some files, defers others, hides nothing, converges`: covers AC5
- [ ] `falls back to cached tabs when relisting is unaffordable`: covers AC6
- [ ] `idle run costs one fetch and at most 8 D1 calls`: covers AC7
- [ ] `listTabs failure fails the run with a code and writes no cache row`: covers AC8
- [ ] `subrequest_limit during listTabs trips the breaker and finishes the row`: covers AC8 and TASK-68

## Files this task may touch
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/test/sync/runSync.spec.ts`
- `sheet-rag/test/sync/runSyncListing.spec.ts` (new, to keep the existing spec file small)
- Shared: `runSync.ts` with TASK-68 and TASK-69 (both before). Reads `syncFiles.ts`, `budget.ts`.

## Dev notes
<!-- Written by dev. -->

## Review
<!-- Written by lead. -->

## Questions
