# TASK-67: Parse each file's `modified` text from the folder page; expose a skip signature

- id: TASK-67
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: in-progress
- assignee: dev
- rework count: 0
- depends on: TASK-64 (shares publicGoogleSource.ts; which itself runs after TASK-63)
- size: fits a 100k-token context (few files, one behaviour)

## Background
The folder page (`embeddedfolderview`) carries each file's last-modified text. The working sheet-rag reference parses it after the title with `flip-entry-last-modified"><div>([^<]*)<`. If `modified` is unchanged, the tab list of that file cannot have changed, so TASK-70 skips `listTabs` for it. This task only exposes the data; it changes no sync behaviour.

## Acceptance criteria
1. AC1: `SheetFile` (in `sheetSource.ts`) gains `modified?: string` (trimmed, HTML entities decoded). Undefined when the page has no modified text for that entry.
2. AC2: `parseFolderFiles` fills `modified` by matching `flip-entry-last-modified"><div>([^<]*)<` that follows the entry's `flip-entry-title` and precedes the next entry; an entry without it still parses (modified undefined). The existing `FOLDER_ENTRY_RE` match of file id and title must not change behaviour (lead: extend by a second scan within the entry's slice, or an optional trailing group; do not break the live-verified regex).
3. AC3: `SheetSource` gains optional `skipSignature?: string`. `createPublicGoogleSource` sets it to a short stable hex-free fingerprint (for example the normalised, sorted, de-duplicated entries joined with `|`, hashed with a simple pure 32-bit hash function written in this file, formatted as `s` + 8 hex chars). Same skip list in any order gives the same signature; a different list gives a different one; empty list gives a fixed value.
4. AC4: Update the folder fixture(s) in `sheet-rag/test/fixtures/google/` so at least one entry has a modified text and one does not, using the real shape `<div class="flip-entry-last-modified"><div>Nov 19, 2026</div></div>` after the title (the real text format is unknown; the code treats it as an opaque string).
5. AC5: The header comment of `publicGoogleSource.ts` documents the modified field.

## Unit tests to write
- [ ] `listFiles returns modified for entries that have it and undefined for others`: covers AC1, AC2
- [ ] `listFiles decodes entities in modified and trims it`: covers AC1
- [ ] `listFiles ids and names unchanged for the existing fixture`: covers AC2 (existing tests stay green)
- [ ] `skipSignature is stable across order and duplicates and differs for different lists`: covers AC3
- [ ] `skipSignature of an empty list is a fixed value`: covers AC3

## Files this task may touch
- `sheet-rag/src/sync/sheetSource.ts`
- `sheet-rag/src/sync/publicGoogleSource.ts`
- `sheet-rag/test/sync/publicGoogleSource.spec.ts`
- `sheet-rag/test/fixtures/google/*.html` (folder fixture only)
- `sheet-rag/test/fakes/sheetSource.ts` only if its types need the optional fields
- Shared: `publicGoogleSource.ts` and `sheetSource.ts` with TASK-63 and TASK-64 (run after both).

## Dev notes
<!-- Written by dev. -->
- Red first: 5 new or changed tests failed for the right reason, then green. Full suite: 69 files, 538 tests pass.
- `FOLDER_ENTRY_RE` is unchanged. `modified` is read by a second regex (`MODIFIED_RE`) inside each entry's slice: after its title, before the next link or title.
- Blank or missing modified gives `undefined` (the key is not set). Entity decoding and trim are applied.
- skipSignature: NFC/trim/lower-cased, non-blank entries, de-duplicated, sorted, JSON-stringified, FNV-1a 32-bit. JSON is used instead of `|` join so that an entry containing `|` cannot collide with two entries. Empty list gives `s741638a5`.
- Fixture folder.html: entry 0 modified "Nov 19, 2026", entry 1 "Nov 18, 2026", entry 2 has none.
- Not touched: runSync.ts, fakes (optional fields need no change).

## Review
<!-- Written by lead. -->

## Questions
