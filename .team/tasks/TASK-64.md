# TASK-64: SKIP_TABS accepts tab-name-only entries, case-insensitive; recommended skip list in the deploy doc

- id: TASK-64
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-63 (shares publicGoogleSource.ts and its spec), TASK-46 (done)
- size: fits a 100k-token context (few files, one behaviour)

## Background
Today `SKIP_TABS` only matches the exact string `File name/Tab name`. The live folder has 450+ tabs, many non-hotel (for example 'DS KS TOÀN QUỐC', 'QUY TRÌNH BOOK KS', 'Trang tính1', 'Trang tính4', 'Weekday Pricelist', 'Weekend Pricelist', 'Landtour Đà Nẵng', 'Khách Sạn Và Vé', 'Đầu Mối Khách Sạn', 'DU THUYỀN ELITE OF SAIGON') that repeat across city files, so one tab-name-only entry should skip them everywhere.

Semantics (fixed by lead): an entry is trimmed and compared case-insensitively after Unicode NFC normalisation (`toLowerCase()`). A tab is skipped when the normalised entry equals either `<fileName>/<tabName>` or just `<tabName>`. Because both forms are compared as whole strings, a tab name that contains `/` is still matched by its own whole-name entry. Empty entries are ignored. The code must NOT hardcode any of the tab names above.

## Acceptance criteria
1. AC1: New exported pure function `buildSkipMatcher(entries: string[]): (fileName: string, tabName: string) => boolean` in `publicGoogleSource.ts`, with the semantics above. `listTabs` uses it instead of the exact-string set.
2. AC2: `File/Tab` exact entries from TASK-46 still skip (backward compatible), now also case-insensitively.
3. AC3: A tab-name-only entry skips that tab in every file.
4. AC4: Matching is case-insensitive and NFC-normalised (a decomposed Vietnamese name in the entry matches the composed name in the sheet, and vice versa).
5. AC5: A tab name containing `/` is matched by a tab-name-only entry equal to the whole name.
6. AC6: Empty or whitespace-only entries match nothing. `parseSkipTabs` is unchanged (still a JSON array of strings, errors as before).
7. AC7: `sheet-rag/DEPLOY-hotel-dictionary.md` documents the new SKIP_TABS forms and adds a clearly marked "Recommended default, owner to confirm" JSON array with the ten tab names listed in Background (exactly: DS KS TOÀN QUỐC, QUY TRÌNH BOOK KS, Trang tính1, Trang tính4, Weekday Pricelist, Weekend Pricelist, Landtour Đà Nẵng, Khách Sạn Và Vé, Đầu Mối Khách Sạn, DU THUYỀN ELITE OF SAIGON). `wrangler.hotel.jsonc` and `src/` keep `"SKIP_TABS": "[]"` and no hardcoded names.
8. AC8: The doc notes that a tab that becomes skipped is treated as removed by the next run, so its hotel is hidden if one had been synced.

## Unit tests to write
- [ ] `buildSkipMatcher matches File/Tab exactly`: covers AC1, AC2
- [ ] `buildSkipMatcher is case-insensitive for both forms`: covers AC2, AC4
- [ ] `buildSkipMatcher tab-only entry skips the tab in every file`: covers AC3
- [ ] `buildSkipMatcher treats decomposed and composed Vietnamese as equal`: covers AC4
- [ ] `buildSkipMatcher matches a tab name that contains a slash`: covers AC5
- [ ] `buildSkipMatcher ignores empty entries`: covers AC6
- [ ] `listTabs drops tabs matched by the matcher and keeps the rest`: covers AC1 (fixture htmlview)
- [ ] `parseSkipTabs behaviour unchanged`: covers AC6 (existing tests stay green)
- [ ] `deploy doc lists the ten recommended tab names and src has none of them`: covers AC7 (reads the doc file and greps `src/`; if reading files from a unit test is not already done in this repo, use `node:fs` as `test/fakes/migrations.ts` does)

## Files this task may touch
- `sheet-rag/src/sync/publicGoogleSource.ts`
- `sheet-rag/test/sync/publicGoogleSource.spec.ts`
- `sheet-rag/test/sync/skipTabsDoc.spec.ts` (new, only for the doc check)
- `sheet-rag/DEPLOY-hotel-dictionary.md`
- Shared files: `publicGoogleSource.ts` (TASK-63, TASK-67) and `DEPLOY-hotel-dictionary.md` (TASK-71). Run strictly after TASK-63; TASK-71 runs after this.

## Dev notes
<!-- Written by dev. -->
- Red: 16 new tests failed before the change (buildSkipMatcher missing, doc not updated).
- Green: `buildSkipMatcher` added and used by `listTabs`; `parseSkipTabs` unchanged; no tab names in code.
- Existing test "leaves out tabs in skipTabs" changed its expectation to `["Café Lotus"]`: its entry `hanoi/Hotel "Sunrise" Villa` is now matched case-insensitively (AC2), so the old expectation encoded the case-sensitive behaviour.
- Doc: SKIP_TABS forms, recommended default JSON block (owner to confirm) with the ten names, and the removed/hidden note (AC8).
- For TASK-71 (owns wrangler.hotel.jsonc): the comment on line 53 still describes only the "File name/Tab name" form.
- Unit run (`env -u CLOUDFLARE_API_TOKEN npm test -- --run`): 521 passed, 2 failed, both in test/db/syncRuns.spec.ts (abandonRun), TASK-68 area. My specs: 50/50 pass.

## Review
<!-- Written by lead. -->

## Questions
