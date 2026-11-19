# TASK-62: Fix tab-list regex for real htmlview shape and add fetch retry

- id: TASK-62
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-46 (done)
- size: fits a 100k-token context (few files, one behaviour)

## Background (real production failure, first live sync 2026-11-19)
The sync run log shows one failure `tab_list_parse_empty`: the folder listing worked, but the tab-list parse found no tabs for at least one file.

Root cause, verified against the deployed sheet-rag source that works on the owner's folder: real htmlview tab entries look like

`items.push({name: "<js-escaped name>", pageUrl: "<url>", gid: "<digits>"`

A `pageUrl` field sits between `name` and `gid`, and the entry is not necessarily closed by `})` right after gid. Our `TAB_ITEM_RE` in `sheet-rag/src/sync/publicGoogleSource.ts` is
`/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)",\s*gid:\s*"(\d+)"\s*\}\)/g`
which requires name and gid adjacent plus a closing `})`. The fixture `sheet-rag/test/fixtures/google/htmlview.html` was hand-written with the wrong shape (`items.push({name: "Mong Hotel", gid: "0"});`), so tests passed while production failed.

Working reference regex: `/items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*", gid: "(\d+)"/g`

Notes:
- The folder-listing regex was verified to work on the live folder (files were found); do NOT change it.
- The header comment of `publicGoogleSource.ts` documents the real shape; keep it consistent (update if it is inaccurate).

## Acceptance criteria
1. AC1: `TAB_ITEM_RE` is replaced by a tolerant version matching name, then an optional `pageUrl` field, then gid, with no required closing `})`. Suggested: `/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"(?:,\s*pageUrl:\s*"[^"]*")?,\s*gid:\s*"(\d+)"/g`. `decodeJsString` behaviour on names is unchanged (escaped quotes, unicode escapes still decoded).
2. AC2: The `htmlview.html` fixture is rewritten to the real shape (including `pageUrl`, no `})` directly after gid), keeping one name with an escaped quote and one Vietnamese-diacritic name. `htmlview-empty.html` is updated only if affected.
3. AC3: A second fixture or inline case using the old no-pageUrl shape (`items.push({name: "Mong Hotel", gid: "0"});`) also parses, proving tolerance.
4. AC4: `getText` retries up to 3 tries total on HTTP 429 or >= 500, with backoff 1s, 2s, 4s plus up to 500ms random jitter between tries. The sleep function is injectable via the options (`sleep?: (ms: number) => Promise<void>`, default real `setTimeout`) so tests run instantly.
5. AC5: Non-retryable statuses (e.g. 404, 403) fail at once with no retry and no sleep.
6. AC6: A thrown fetch is also retried; after the final try it is reported as `<reason>_network`.
7. AC7: Existing sanitized error codes stay (`<reason>_http_<status>`, `<reason>_network`, `tab_list_parse_empty`); no URLs appear in errors.

## Unit tests to write
- [ ] `parses all tabs from real-shape htmlview fixture with correct names and gids`: covers AC1, AC2 (escaped-quote name and Vietnamese name decoded)
- [ ] `parses legacy no-pageUrl shape`: covers AC3
- [ ] `empty htmlview page throws tab_list_parse_empty`: covers AC1, AC7
- [ ] `retries once after a 503 then succeeds`: covers AC4 (assert injected sleep called once with a value in 1000..1500)
- [ ] `gives up after 3 tries on 503 with <reason>_http_503`: covers AC4, AC7 (fetch called 3 times; sleeps in ranges 1000-1500 and 2000-2500)
- [ ] `does not retry 404 (or 403)`: covers AC5 (fetch called once, sleep not called)
- [ ] `retries a thrown fetch then reports <reason>_network`: covers AC6, AC7
- [ ] `error messages contain no URL`: covers AC7

## Files this task may touch
- `sheet-rag/src/sync/publicGoogleSource.ts`
- `sheet-rag/src/sync/sheetSource.ts` (only if an option type must change)
- `sheet-rag/test/sync/publicGoogleSource.spec.ts`
- `sheet-rag/test/fixtures/google/htmlview.html`
- `sheet-rag/test/fixtures/google/htmlview-empty.html`
- a new second fixture under `sheet-rag/test/fixtures/google/` is allowed only for the legacy-shape case (or use an inline string in the spec instead)

## Dev notes
<!-- Written by dev. -->
- TDD: spec and fixtures first (red: 7 failing), then code (green). Full suite: 63 files, 467 tests passed.
- TAB_ITEM_RE: name, optional `pageUrl`, then gid; no closing `})` needed. Folder regex untouched.
- htmlview.html rewritten to real shape (pageUrl, no `})` after gid); legacy no-pageUrl case is an inline string in the spec.
- getText: up to 3 tries on 429 or >= 500 or thrown fetch; backoff 1000/2000 ms + 0..500 ms jitter; injectable `sleep` option (default setTimeout).
- Existing 500/network tests now pass `sleep: noSleep` so they stay instant.
- "no URL" test checks for `://` and `docs.google` (the `_http_` code itself contains "http").
- Header comment of publicGoogleSource.ts updated to describe the real tab shape and retries.
- Files changed: sheet-rag/src/sync/publicGoogleSource.ts, sheet-rag/test/sync/publicGoogleSource.spec.ts, sheet-rag/test/fixtures/google/htmlview.html, .team/tasks/TASK-62.md. sheetSource.ts and htmlview-empty.html not touched (not needed).

## Review
<!-- Written by lead. Verdict: approve | rework -->

## Questions

## Review
Verdict: approve (lead).
- TAB_ITEM_RE equals the reference regex plus an optional pageUrl group (legacy); matches `items.push({name: "...", pageUrl: "...", gid: "123", index: 0` with escaped quotes. Fixture has real shape, escaped quote, diacritics. Legacy case tested. Folder regex untouched; folder, tab list and CSV URLs identical to the reference.
- Retry: 3 tries on 429/>=500/thrown fetch, backoff 1s/2s + jitter up to 500ms, injectable sleep, 404/403 not retried, errors carry only reason codes. Tests cover each. Only listed files changed (.team edits are pm's).
- Non-blocking follow-up (not a rework): decodeJsString does not handle `\xNN` (reference does). A tab name containing `\x26` would decode to "x26". Parsing still succeeds; only the name text is affected. Fix later: in JS_ESCAPE_RE add `x[0-9a-fA-F]{2}` and decode like `u`, plus a test.
