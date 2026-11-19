# TASK-46: SheetSource interface, CSV-URL implementation and fake

- id: TASK-46
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: todo
- rework count: 0
- depends on: none
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/sheetSource.ts` exports `SheetTab = { fileId: string; fileName: string; gid: string; tabName: string }` and `interface SheetSource { listTabs(): Promise<SheetTab[]>; readTab(tab: SheetTab): Promise<string> }` (CSV text). `fileName` is the city source, `tabName` the hotel name source; `fileId`+`gid` are the stable identity (STORY-14 AC1).
2. AC2: `src/sync/csvUrlSource.ts` exports `parseSheetCsvUrls(raw: string | undefined): SheetTabConfig[]` for the secret `SHEET_CSV_URLS`, a JSON array of `{ tab, url, file?, fileId?, gid? }`. Missing `file` defaults to `"unknown"`; missing `fileId`/`gid` are derived from a Google Sheets URL (`/d/<id>/` and `gid=` query), else `fileId` = `"csv"` and `gid` = the first 16 hex of sha256(url). Invalid JSON, a non-array, a non-https url or a duplicate (fileId,gid) throws `SheetConfigError` with a clear message. Unset or empty returns `[]`.
3. AC3: `createCsvUrlSource(configs, fetchFn = fetch): SheetSource`. `listTabs` maps configs to `SheetTab`; `readTab` fetches the url and returns text; a non-2xx status or a network error throws `SheetReadError` (never returns empty text).
4. AC4: `test/fakes/sheetSource.ts` exports `createFakeSheetSource({ tabs, csv, failList?, failRead? })` implementing `SheetSource`, with mutable `tabs` and `csv` map keyed `fileId:gid` so tests can edit, remove and fail.
5. AC5: no import from outside `src/sync/` and `src/domain/` (no Cloudflare bindings).

## Unit tests to write
- [ ] `sheetSource types compile via the fake`: covers AC1
- [ ] `parseSheetCsvUrls reads valid json and derives ids from a Google url`: covers AC2
- [ ] `parseSheetCsvUrls rejects bad json, non-https and duplicate ids`: covers AC2
- [ ] `parseSheetCsvUrls returns empty for unset`: covers AC2
- [ ] `readTab returns the text and throws SheetReadError on 500 and on network error`: covers AC3
- [ ] `fake source lists, edits, removes and fails on demand`: covers AC4
- [ ] `no forbidden imports in src/sync/sheetSource.ts and csvUrlSource.ts`: covers AC5

## Files this task may touch
- `sheet-rag/src/sync/sheetSource.ts`
- `sheet-rag/src/sync/csvUrlSource.ts`
- `sheet-rag/test/fakes/sheetSource.ts`
- `sheet-rag/test/sync/csvUrlSource.spec.ts`
- `sheet-rag/test/fakes/sheetSource.spec.ts`

## Dev notes
Use Web Crypto (`crypto.subtle`) for sha256 only if TASK-47's `src/sync/hash.ts` is not yet merged; otherwise do not import it (keep disjoint): write a private 5-line helper.

## Review

## Questions
