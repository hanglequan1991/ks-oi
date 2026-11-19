# TASK-54: runSync orchestrator and run log

- id: TASK-54
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-59 (vitest include for test/sync, must run first), TASK-46, TASK-49, TASK-53
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/db/syncRuns.ts` exports `startRun(db, kind, now): Promise<string>`, `finishRun(db, id, counts, notes, now)`, `getLatestRun(db)`. `notes` is a JSON string of at most 4000 characters (truncated, still valid JSON: `{"items":[...],"truncated":true}`).
2. AC2: `src/sync/runSync.ts` exports `runSync(deps, opts?: { force?: boolean }): Promise<SyncSummary>` with `deps = { db, source: SheetSource (from TASK-46), parse: (csv: string, tab: SheetTab) => ParseResult, now: () => string, extract?: (...) => ... }`; `ParseResult = { ok: true; record: ParsedHotel } | { ok: false; reason: string }`. No Cloudflare imports; everything injected.
3. AC3: flow: `listAllTabs(source)` -> `readCsv` and hash each tab (`contentHash(csv, PARSER_VERSION)`) -> `planSync` -> for each changed tab, parse then `syncHotel`; one failing tab (parse failure, invalid, error) never stops the others (STORY-14 AC7, AC11). `autoPublish` read from `settings.sync_auto_publish` (`'true'` only; the migration seeds `'true'`, the owner can set `'false'`).
4. AC4: if `listFiles`, any `listTabs` or `listAllTabs` throws (including the `folder_parse_empty` and `tab_list_parse_empty` guards of TASK-46), the run is recorded as failed and NOTHING is removed or hidden (STORY-14 AC13). A single tab whose `readCsv` fails is reported and its hotel left alone.
5. AC5: removed tabs: hotel set to `hidden` with `hidden_by_sync = 1`, `prior_status` = status before, `markTabMissing`; a hotel already `hidden` is not touched; hotels are never deleted (STORY-14 AC9).
6. AC6: a run with no change reports `unchanged = N`, `created = updated = 0`, writes no hotel rows and does not bump `data_version` (STORY-14 AC10).
7. AC7: `sync_runs` row has created, updated, failed, hidden, unchanged counts and a notes list of failures (tab name, reason code, message) and unmapped facility labels; no secret or URL with a token is ever written to notes.
8. AC8: concurrency: if a run started less than 15 minutes ago and has no `finished_at`, `runSync` returns `{ skipped: 'already_running' }` without doing anything.
9. AC9: the value returned by `runSync` (it is served as the body of `POST /internal/sync`, TASK-55, unfiltered) contains ONLY counts (created, updated, failed, hidden, unchanged) and failure entries made of tab name and reason code (plus `skipped` / `failed_run` flags). No row text, no URLs, no file ids, no error messages from sources, no secrets.

## Unit tests to write
- [ ] `first run creates hotels, second run changes nothing`: covers AC3, AC6
- [ ] `editing one tab updates only that hotel`: covers AC3
- [ ] `invalid tab reported, valid tab still synced`: covers AC3, AC7
- [ ] `listFiles or listTabs failure (and an empty-parse error) fails the run and hides nothing`: covers AC4
- [ ] `readCsv failure for one tab leaves its hotel alone`: covers AC4
- [ ] `removed tab hides the hotel, owner-hidden hotel untouched, tab returns restores`: covers AC5
- [ ] `a source that returns an empty tab list through an error hides nothing`: covers AC4, AC5
- [ ] `run log counts and truncation`: covers AC1, AC7
- [ ] `second concurrent run is skipped`: covers AC8
- [ ] `notes contain no url or token`: covers AC7
- [ ] `returned summary has only counts and failure codes, no url, row text or secret`: covers AC9 (serialize the result and assert it contains no URL, token or cell text from the fixture)

## Files this task may touch
- `sheet-rag/src/db/syncRuns.ts`
- `sheet-rag/src/sync/runSync.ts`
- `sheet-rag/test/db/syncRuns.spec.ts`
- `sheet-rag/test/sync/runSync.spec.ts`

## Dev notes
The test uses a stub parse function that reads a trivial format defined in the test; the real parser is TASK-58.

- Dev (TASK-54): red then green; `npm test -- --run` full suite 454 passed, 0 failed.
- `extract` is typed optional in SyncDeps and not used (syncHotel takes no extractor).
- `PARSER_VERSION = "1"` is defined locally in src/sync/runSync.ts (no shared constant exists yet). The parser task should move it.
- `finishRun` takes a list of note items and encodes it (truncated, valid JSON), instead of a pre-built JSON string.
- Notes hold failure items (tab, reason code) and unmapped facility items (tab, facility label). Error messages from sources are not stored.
- `kind` option is passed through to sync_runs.kind (default `manual`).

## Review

## Questions
