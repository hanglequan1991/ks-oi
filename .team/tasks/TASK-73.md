# TASK-73: runSync read-skip: do not readCsv tabs whose Drive file `modified` and parser version are unchanged

- id: TASK-73
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-72 (columns and helpers), TASK-70 (listing cache; both edit runSync.ts, TASK-70 first), TASK-69 (done)
- size: fits a 100k-token context (few files, one behaviour)

## Background
After TASK-70 an idle run costs one listing fetch but still reads (readCsv) up to maxTabsPerRun tabs to hash them. This task skips the read when nothing can have changed, the same file-level `modified` check the reference worker uses. Result: an idle run costs exactly 1 fetch.

Design (lead):
- Build `modifiedOf: Map<fileId, string | undefined>` from the file listing of this run (the value from `listFiles`, taken BEFORE any read; that same value is what gets stored, so an edit during the run is seen next run).
- A tab is skippable only when ALL hold: not `opts.force`; the file's `modified` is a non-null, non-empty string; the tab's state row exists with `hash` non-null, `last_error` null, `missing_since` null; `row.file_modified === file.modified`; `row.parser_version === PARSER_VERSION` (exported from runSync.ts); and `last_checked_at` is non-null and younger than `SKIP_MAX_AGE_MS` (new exported constant, 7 days). The age cap bounds how long a stale result can hide an edit if Drive's `modified` text is coarse (it is opaque text from the folder page); every tab is re-read at least weekly, spread across runs by oldest-first order.
- Skippable tabs are removed from the candidates BEFORE `pickOldestFirst` (they do not use the maxTabsPerRun cap). They make no readCsv call and no D1 write (not even `last_checked_at`). They count in `counts.unchanged`.
- Skipped tabs still go through `markTabsSeenBatch` (they are present) and remain in the full `tabs` used for removal planning: never hidden, never marked missing by the skip.
- Non-skippable tabs behave as in TASK-69. On `unchanged` after a read, `markTabsChecked` gets `meta {fileModified, parserVersion: PARSER_VERSION}` for that key. On apply success, pass `fileModified` and `parserVersion` to `syncHotel`. Failed attempts (`attemptedKeys`, read failure, parse failure, invalid, apply_failed) get no meta, so the stored `file_modified` is not moved by a failure.
- `file.modified` undefined/null: store `null`, tab never skippable.

## Acceptance criteria
1. AC1: A tab with matching `file_modified`, current parser version, clean state, fresh `last_checked_at` and unchanged file `modified` is not read (zero readCsv for it), makes no D1 write of its own, and counts as unchanged.
2. AC2: Not skipped (read as before) when any of: file `modified` changed; file `modified` undefined or null; no stored `file_modified`; stored `parser_version` differs from PARSER_VERSION (including null); `last_error` set; `missing_since` set; no stored hash; `last_checked_at` older than SKIP_MAX_AGE_MS; `opts.force`. One test per condition (table-driven is fine).
3. AC3: Skipped tabs do not consume the maxTabsPerRun cap: with 30 skippable and 10 non-skippable tabs and cap 25, all 10 non-skippable are read in one run.
4. AC4: After a read that finds the hash unchanged, `file_modified` and `parser_version` are stored for the tab; after an apply success they are stored; after a read failure, parse failure, invalid or apply_failed they are not changed.
5. AC5: The stored `file_modified` is the value from this run's `listFiles` (a fake that changes `modified` between listFiles and the end of the run does not make the stored value newer).
6. AC6: Removal is unchanged: a skipped tab present in the listing is never hidden and never marked missing; a tab absent from a complete listing is still hidden as before; owner-hidden tabs are never un-hidden; failed listings and deferred tabs never mark anything removed (TASK-69 and TASK-70 guarantees hold).
7. AC7: Idle-run cost, `countingDb` and `countingFetch` around fakes, cache warm, all files unchanged, all tabs skippable, nothing to apply: (a) fixture of at most 50 tabs: exactly 1 fetch (listing only; zero listTabs, zero readCsv) and at most 8 D1 calls; (b) fixture of 450 tabs: exactly 1 fetch and D1 calls `<= 7 + ceil(tabs / 50)` (so `<= 16`). Assert the measured numbers within these bounds (expected: 6 + ceil(tabs / 50), since `markTabsChecked` has no keys and makes no call; if the measured count differs, assert the measured value and explain in Dev notes).
8. AC8: Convergence: a cold 450-tab fixture with cap 25 and a stable folder reaches an idle run (zero readCsv) after enough runs (simulate with fake time) and a changed file afterwards re-reads only that file's tabs.
9. AC9: Existing runSync specs stay green (fakes without `modified` never skip, so TASK-69 rotation tests are unaffected); any assumption updated deliberately.

## Unit tests to write
- [ ] `skips readCsv for an unchanged clean tab and counts it unchanged`: covers AC1
- [ ] `reads when modified changed, missing, no stored value, parser version differs, error, missing_since, no hash, stale age or force`: covers AC2
- [ ] `skipped tabs do not use the per-run cap`: covers AC3
- [ ] `stores file_modified and parser_version on unchanged and applied tabs, not on failures`: covers AC4
- [ ] `stores the modified value seen at listing time`: covers AC5
- [ ] `skipped tabs are never hidden or marked missing; removal rules intact`: covers AC6
- [ ] `idle run with at most 50 tabs costs one fetch and at most 8 D1 calls`: covers AC7(a)
- [ ] `idle run with 450 tabs costs one fetch and at most 7 + ceil(tabs / 50) D1 calls`: covers AC7(b)
- [ ] `cold folder converges to an idle run; a changed file re-reads only its tabs`: covers AC8

## Files this task may touch
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/test/sync/runSync.spec.ts` (only to keep existing tests green)
- `sheet-rag/test/sync/runSyncReadSkip.spec.ts` (new)
- Shared: `runSync.ts` with TASK-68, 69, 70 (all before). Reads `syncState.ts`, `syncHotel.ts` (TASK-72).

## Dev notes
<!-- Written by dev. -->

## Review
<!-- Written by lead. -->

## Questions
