# TASK-58: rowParser: read a hotel tab (rooms, prices, rules, images, facilities) into ParsedHotel

- id: TASK-58
- story: [STORY-14](../stories/STORY-14.md)
- type: backend
- status: blocked: question
- rework count: 0
- depends on: TASK-47, TASK-48, TASK-56 (replaces its stub), TASK-57; and the user's sample rows (see Questions)
- size: fits a 100k-token context (few files, one behaviour) once the samples exist; split again if the layout has several variants

## Acceptance criteria
The ACs below are PROVISIONAL and cannot be made exact until the samples arrive. Do not start.
1. AC1: `parseSheetRows(csv: string, tab: SheetTab): ParseResult` in `src/sync/rowParser.ts` uses `parseCsv` and returns a `ParsedHotel` (TASK-48) or `{ ok: false, reason }`; it never throws.
2. AC2: rooms and prices: layout TBD from samples (table or free-form blocks; price as plain number or with "k"/"VND"). Prices are whole VND, base price only; no price gives `null`; an unparseable price is passed through as invalid (so validation rejects it), never guessed.
3. AC3: booking rules, hotel level and room level: TBD from samples; text captured verbatim, cell by cell, no trimming of inner text, never summarised.
4. AC4: images: https links found in cells (TBD: links in cells vs pasted pictures); stars, address, facilities and description located per the samples.
5. AC5: one fixture CSV per sample tab (redacted) in `test/fixtures/sync/` and a spec per layout variant, including a garbage tab (reason returned, no throw).

## Unit tests to write
To be named once the layout is known; at least one per AC above and one per sample tab.

## Files this task may touch
- `sheet-rag/src/sync/rowParser.ts`
- `sheet-rag/test/sync/rowParser.spec.ts`
- `sheet-rag/test/fixtures/sync/*.csv`

## Dev notes

## Review

## Questions
Q1 (for the owner, via product): what we need, redacted, from two tabs in two different cities (about 20 rows in total):
1. The raw rows exactly as the sheet exports them as CSV (File > Download > CSV for the tab), or a paste of the cells, keeping blank rows, merged cells and order. Redact names, phone numbers and addresses but keep every other character.
2. How rooms and nightly prices appear: one table with a header row, or free-form blocks; how a price is written (123000, 1.250.000, 1,250k, "1tr2", with "VND" or "đ"); what an empty or "liên hệ" price looks like; whether a price depends on weekday, season or number of guests (we store the BASE price only: which one is it?).
3. Booking rules: where hotel-level rules sit (one block, one cell, or one row per rule) and how room-level rules are attached to a room (same row, a column, a block under the room); one example of each, word for word.
4. Images: links typed in cells, or pictures pasted into cells (pasted pictures are not exported to CSV).
5. Where star rating, address, area, facilities, utilities and description sit, with one example of each.
6. Sheet file and tab: the file name used as the city and whether a tab is always exactly one hotel; any tabs that are NOT hotels (summary, template) and must be skipped.
A: (open, waiting for the owner)
