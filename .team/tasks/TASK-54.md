# TASK-54: runSync orchestrator and run log

- id: TASK-54
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: done
- assignee: dev
- rework count: 1
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

Rework 1 (dev):
- AC9 test extended with hostile fixtures: parse reason = URL, parse throws with URL + token + row text, readCsv SheetReadError(URL), listFiles and listTabs errors carrying URL/token (failed run). Unmapped facility label is absent from the result and present only in notes. Serialized results checked for URL, token, row text, file id, label.
- `hideRemovedTab` is atomic: the missing mark (`MARK_REMOVED_HIDDEN_SQL`, same effect as markTabMissing plus hidden_by_sync = 1) is in the same `db.batch` as the hotel hide and the data version statement. Owner-hidden branch still uses markTabMissing. syncState.ts unchanged. New test "a failing batch leaves the tab unmarked, so the next run hides it".
- PARSER_VERSION is still local in src/sync/runSync.ts (not moved). TASK-58 (parser) must move it or own it. Do not move it before then.
- Suite: `env -u CLOUDFLARE_API_TOKEN npm test -- --run`: 62 files, 456 passed, 0 failed.

## Review

Verdict: rework (2 small items; everything else approved).

Checked: full suite 62 files / 454 tests green; only the 4 listed files are new/changed (plus this task file); no Cloudflare imports in runSync.

Approved parts: AC1-AC8 covered by named tests; listing failures (folder_parse_empty, tab_list_parse_empty, fetch errors) fail the run via the listAllTabs catch before anything is written, nothing hidden or marked missing (tested, state rows compared before/after); empty listing is a no-op via planSync; per-tab errors isolated; concurrency guard is correct (strictly newer than 15 min blocks, stale/crashed run does not, tested); run row finished with failed_run on listing or unexpected throw; removed-tab flow matches TASK-49/53 (owner-hidden untouched, hidden_by_sync/prior_status, restore through syncHotel).

Deviations judged: (1) `extract` optional and unused: acceptable. The AI extractor lives in TASK-57 (src/sync/extract.ts, `pickExtractor`) and is to be used inside the parser, TASK-58; runSync never needs it, since `parse` is injected. Remove the dead field only if TASK-58 does not need it; harmless otherwise. (2) Local `PARSER_VERSION = "1"`: acceptable, TASK-58 must move/own it (add to its notes). (3) Notes in D1 hold tab name, reason code, unmapped facility label, truncated valid JSON <= 4000: acceptable, the table is internal and never returned; reasons are sanitized to `^[a-z][a-z0-9_]*$`, source error messages are never stored. (4) `kind` default 'manual' and `finishRun` taking items instead of a JSON string: acceptable (encodeNotes is exported and tested).

AC9 result type is fine by inspection: counts, `failures: {tab, reason}[]`, `failed_run`, `skipped` only; reasons pass through sanitizeReason, unmapped facilities are not in the result.

Rework notes:
1. AC9 test is not hostile enough. The hostile fixture only covers a readCsv Error carrying a URL. Extend the "returned summary ..." test (and assert on the serialized result) with: a parse function returning `{ ok:false, reason: SHEET_URL }`, a parse function that throws an Error containing SHEET_URL and the secret, a `listFiles` throwing `new SheetReadError(SHEET_URL)` (failed run), and a `SheetReadError` with a non-code reason on readCsv. Expect `unexpected_error` in each case and no URL, token, file id or row text in `JSON.stringify(result)`. Also include a facility label not in the map and assert it is absent from the result (present only in notes).
2. `hideRemovedTab` is not atomic. `markTabMissing` is committed first, then the hotel is hidden in a separate batch. If the batch fails, the tab has `missing_since` set but the hotel stays visible, and planSync never lists it as removed again, so the hotel is never hidden (the opposite of STORY-14 AC9). Fix inside runSync.ts only: put the missing marking into the same `db.batch` as the hotel hide and the `hidden_by_sync` update (e.g. one `UPDATE sync_state SET missing_since = COALESCE(missing_since, ?), prior_status = ?, hidden_by_sync = 1, updated_at = ?` statement in the batch, without changing syncState.ts, which is outside the file list), keeping the owner-hidden branch using `markTabMissing`. Add a test that a failing batch (fake D1 throwing on batch) leaves `missing_since` null so the next run retries and hides it.

### Re-review (after rework 1)

Verdict: approve.

Checked: coordinator's run of `env -u CLOUDFLARE_API_TOKEN npm test -- --run` = 62 files / 456 tests green; code and tests read directly.
1. AC9 test: resolved. Covers parse reason = URL, parse throwing URL + token + row text, readCsv `SheetReadError(URL)`, and (separate test) listFiles/listTabs errors with URL/token (failed run, `unexpected_error`, tab null). Serialized result is checked for `https://`, token, row text, file ids and the unmapped facility label; exact key set and exact failures list asserted; the label is asserted present only in notes.
2. Atomic hide: resolved. `MARK_REMOVED_HIDDEN_SQL`, the hotel hide and `buildDataVersionStatement` are in one `db.batch`; owner-hidden/missing-hotel branch still uses `markTabMissing`. The failing-batch test genuinely distinguishes the orders: the fake DB only overrides `batch`, so in the old order `markTabMissing` (a plain prepare/run) would have succeeded and left `missing_since` set before the batch threw; the test asserts `missing_since: null`, `hidden_by_sync: 0`, `prior_status: null` and a published hotel, which would fail on the old code. The retry run then hides it with the right state.

Accepted: PARSER_VERSION stays local until TASK-58. Only the listed files changed.

## Questions
