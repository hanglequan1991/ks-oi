# TASK-47: CSV parsing helper and hash helper

- id: TASK-47
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-59 (adds test/sync to the vitest include list; must run first)
- size: fits a 100k-token context (few files, one behaviour)

## Acceptance criteria
1. AC1: `src/sync/csv.ts` exports `parseCsv(text: string): string[][]` (RFC 4180): quoted fields, doubled quotes, commas and CR/LF/CRLF newlines inside quotes, a leading BOM stripped, a trailing newline not producing an empty row, empty text giving `[]`. Cell text is otherwise returned untouched (no trim) so booking rules stay word for word.
2. AC2: `parseCsv` never throws on malformed input (an unterminated quote consumes to the end of the text).
3. AC3: `src/sync/hash.ts` exports `async sha256Hex(text: string): Promise<string>` (Web Crypto, lowercase hex) and `hotelIdFor(fileId, gid): Promise<string>` = first 16 hex of sha256(`${fileId}:${gid}`) (matches the 0001 comment).
4. AC4: `contentHash(csv: string, version: string): Promise<string>` = sha256(`${version}\n${csv}`), so bumping a parser version re-processes tabs.
5. AC5: pure code, imports nothing outside `src/sync/`.

## Unit tests to write
- [ ] `parseCsv handles quotes, embedded newlines, CRLF, BOM`: covers AC1
- [ ] `parseCsv keeps leading and trailing spaces and Vietnamese text`: covers AC1
- [ ] `parseCsv unterminated quote does not throw; empty text gives empty array`: covers AC2
- [ ] `sha256Hex known vector and hotelIdFor is 16 hex and stable`: covers AC3
- [ ] `contentHash changes with version and with csv`: covers AC4

## Files this task may touch
- `sheet-rag/src/sync/csv.ts`
- `sheet-rag/src/sync/hash.ts`
- `sheet-rag/test/sync/csv.spec.ts`
- `sheet-rag/test/sync/hash.spec.ts`

## Dev notes
- Wrote `sheet-rag/test/sync/csv.spec.ts` and `sheet-rag/test/sync/hash.spec.ts` (red phase, not yet run green).
- `env -u CLOUDFLARE_API_TOKEN npm test -- --run test/sync` reports "No test files found". The vitest include list in `sheet-rag/vitest.unit.config.mts` covers only `test/db`, `test/domain`, `test/migrations`, `test/fakes`, `test/web`, `test/client`. `test/sync/**` is not in it.
- Source files `src/sync/csv.ts` and `src/sync/hash.ts` not written yet (blocked before green).
- Green: wrote `src/sync/csv.ts` (parseCsv) and `src/sync/hash.ts` (sha256Hex, hotelIdFor, contentHash). `test/sync/csv.spec.ts` and `test/sync/hash.spec.ts`: 7 of 7 pass. Full suite: 371 of 372 pass; the one failure is the known `test/db/apiSample.spec.ts` settings count.

## Review

## Questions
- Q1 (technical, for lead): The unit test include glob in `sheet-rag/vitest.unit.config.mts` does not match `test/sync/**/*.spec.ts`, so the new tests cannot run. Should `test/sync/**/*.spec.ts` be added to that config? That file is not in this task's file list. Once it is added (or the owner says otherwise), dev can continue with the green phase.
  - A: Yes. Added via new TASK-59, the only task touching vitest.unit.config.mts; this task now depends on it. Specs test/sync/csv.spec.ts and hash.spec.ts are fine as written, no change needed. Dev may write the green code, but the specs only run once TASK-59 is done.
