# TASK-46: SheetSource interface, PublicGoogleSource (public Drive folder) and fake

- id: TASK-46
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-59 (adds test/sync to the vitest include list; must run first)
- size: fits a 100k-token context (few files, one behaviour)

Context (2026-11-19, from the deployed sheet-rag worker, decision A): the sheets are already synced on sheet-rag and the Drive folder is public (link-shared). The hotel-dictionary sync reads the SAME public Google pages itself, with no credentials. Sandbox cannot reach Google, so this task is tested ONLY against recorded fixtures. The real page format MUST be verified by the owner on the first real run (see Dev notes); a Google format change must never be read as a deletion.

## Acceptance criteria
1. AC1: `src/sync/sheetSource.ts` exports `SheetFile = { fileId: string; fileName: string }`, `SheetTab = { fileId: string; fileName: string; gid: string; tabName: string }` and `interface SheetSource { listFiles(): Promise<SheetFile[]>; listTabs(file: SheetFile): Promise<SheetTab[]>; readCsv(tab: SheetTab): Promise<string> }`. `fileName` is the city source (Drive file name minus `.xlsx`), `tabName` the hotel name source; `fileId`+`gid` are the stable identity (STORY-14 AC1). It also exports `class SheetReadError extends Error` and `listAllTabs(source): Promise<SheetTab[]>` (listFiles then listTabs of each file, in order; any throw propagates).
2. AC2: `src/sync/publicGoogleSource.ts` exports `createPublicGoogleSource({ folderId, skipTabs?, fetchFn = fetch }): SheetSource` and `parseSkipTabs(raw: string | undefined): string[]` (the var `SKIP_TABS`, a JSON array of `"File name/Tab name"` strings; unset or empty gives `[]`; invalid JSON or a non-array of strings throws `SheetConfigError`, also exported from `sheetSource.ts`). A missing or blank `folderId` throws `SheetConfigError`.
3. AC3: `listFiles` fetches `https://drive.google.com/embeddedfolderview?id=${folderId}` and extracts file ids and names by regex (pattern as in sheet-rag: the page has one entry per file with the file id in a `/d/<id>` or `id=<id>` link and the name in a title element). Names have a trailing `.xlsx` removed and HTML entities decoded. Duplicate ids are dropped. A failed fetch throws `SheetReadError('folder_fetch_network')` or `SheetReadError('folder_fetch_http_<status>')`. If the parse yields zero files the call throws `SheetReadError('folder_parse_empty')` (never returns `[]`: an empty parse is an error, not a deletion; STORY-14 AC13).
4. AC4: `listTabs(file)` fetches `https://docs.google.com/spreadsheets/d/${fileId}/htmlview` and parses the entries `items.push({name: "...", gid: "..."})` (name may contain escaped quotes and `\uXXXX` escapes, decoded). Tabs listed in `skipTabs` (matched as `<fileName>/<tabName>`, case-sensitive, after the `.xlsx` strip) are left out. If the page yields zero tabs before skipping the call throws `SheetReadError('tab_list_parse_empty')`; skipping all tabs by configuration is allowed and returns `[]`.
5. AC5: `readCsv(tab)` fetches `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}` and returns the text. A non-2xx status, a network error, an HTML response (body starts with `<!DOCTYPE` or `<html`, as when a sheet is not link-shared) or an empty body throws `SheetReadError` (never returns empty text). Error messages never contain the full URL beyond the host name.
6. AC6: `test/fakes/sheetSource.ts` exports `createFakeSheetSource({ files, tabs, csv, failList?, failRead? })` implementing `SheetSource`, with mutable `files`, `tabs` and a `csv` map keyed `fileId:gid` so tests can edit, remove and fail (`failList` makes `listFiles` throw, `failRead` makes `readCsv` throw for given keys).
7. AC7: fixtures under `test/fixtures/google/` (created by this task, realistic minimal recordings that mimic the patterns above, hand-written because the sandbox cannot reach Google): `folder.html` (3 files incl. one with an HTML entity in the name), `folder-empty.html` (a page with no entries), `htmlview.html` (3 tabs incl. one with an escaped quote and one `\uXXXX`), `htmlview-empty.html`, `sheet.csv`, `not-shared.html`. Tests use only these fixtures through an injected `fetchFn` (no network).
8. AC8: no import from outside `src/sync/` and `src/domain/` (no Cloudflare bindings). The earlier CSV-URL-list implementation (`SHEET_CSV_URLS`) is dropped, not built.

## Unit tests to write
- [ ] `sheetSource types compile via the fake and listAllTabs walks all files`: covers AC1, AC6
- [ ] `parseSkipTabs reads valid json, returns empty for unset, rejects bad json`: covers AC2
- [ ] `createPublicGoogleSource rejects a blank folder id`: covers AC2
- [ ] `listFiles parses ids and names, strips .xlsx, decodes entities, calls the embeddedfolderview url`: covers AC3
- [ ] `listFiles throws folder_parse_empty on the empty page, and folder_fetch_network / folder_fetch_http_<status> on a fetch failure`: covers AC3
- [ ] `listTabs parses names and gids including escapes and honours skipTabs`: covers AC4
- [ ] `listTabs throws tab_list_parse_empty on the empty page`: covers AC4
- [ ] `readCsv returns text and throws SheetReadError on 500, network error, html page and empty body`: covers AC5
- [ ] `fake source lists, edits, removes and fails on demand`: covers AC6
- [ ] `fixtures exist and are the ones used`: covers AC7
- [ ] `no forbidden imports in sheetSource.ts and publicGoogleSource.ts`: covers AC8

## Files this task may touch
- `sheet-rag/src/sync/sheetSource.ts`
- `sheet-rag/src/sync/publicGoogleSource.ts`
- `sheet-rag/test/fakes/sheetSource.ts`
- `sheet-rag/test/sync/publicGoogleSource.spec.ts`
- `sheet-rag/test/fakes/sheetSource.spec.ts`
- `sheet-rag/test/fixtures/google/*`

## Dev notes
Mimic the sheet-rag patterns exactly as listed in the ACs; keep each regex in one named constant so the owner can adjust it.
Dev (2026-11-19): regex constants are FOLDER_ENTRY_RE, TAB_ITEM_RE, XLSX_SUFFIX_RE in `publicGoogleSource.ts`. The folder regex assumes the entry link comes before its `<div class="flip-entry-title">` (fixtures are hand-written). A failed folder fetch throws `folder_fetch_network` or `folder_fetch_http_<status>` (the test name says folder_parse_empty; any SheetReadError keeps the no-deletion guarantee). The tab-list equivalents are `tab_list_fetch_*`; CSV errors are `csv_network`, `csv_http_<status>`, `csv_html_page`, `csv_empty`.
Dev (2026-11-19): tests run and green via a scratch vitest config outside the project (test/sync not in the include, see Questions): 35 passed for publicGoogleSource.spec.ts and fakes/sheetSource.spec.ts. Pre-existing unrelated failure in test/db/apiSample.spec.ts (settings count 6 vs 5, from the migration work), not touched here. State in the file header comment: "Format verified only against hand-written fixtures; the owner must verify against the real pages on the first run (compare the run's file and tab counts with the Drive folder)". Dropping a regex-failed page into an error (not an empty list) is the safety guard. Do not import `src/sync/hash.ts`.

## Review

Verdict: approve (2026-11-19). AC1-AC8 covered. Guards confirmed: empty folder parse gives folder_parse_empty, empty tab parse gives tab_list_parse_empty (never []), HTML or empty CSV gives csv_html_page / csv_empty, network and http errors drop the URL, skipTabs matched as File/Tab, no network (injected fetchFn, fake only reads fixtures). Fixtures are hand-written generic data, no real ids, hotels or prices. Only listed files changed. Note for the owner: format is unverified against real Google pages, as the file header states.

## Questions
Q1 (technical, to lead): `sheet-rag/vitest.unit.config.mts` `test.include` lists only test/db, test/domain, test/migrations, test/fakes, test/web and test/client. `test/sync/**/*.spec.ts` is not included, so `npm test -- --run` silently skips `test/sync/publicGoogleSource.spec.ts` (and the other test/sync specs). Config is not in this task's file list, so I did not edit it. Proposed fix: add `"test/sync/**/*.spec.ts"` to that include array (owner of the config to approve). Until then the official command does not run this task's public-source tests. A (lead, 2026-11-19): handled by TASK-59, which runs first and adds `test/sync/**/*.spec.ts` to the include list. Do not edit the config; your code stays as written. Deviation ruling: ACCEPTED. Throwing `folder_fetch_network` / `folder_fetch_http_<status>` on a failed folder fetch is fine because every `SheetReadError` keeps the no-deletion guarantee (STORY-14 AC13). Task wording corrected below.
