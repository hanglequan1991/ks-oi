# STORY-14: Sync hotels, rooms, prices and booking rules from the Excel sheets into the database

- id: STORY-14
- status: in-progress        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

Decisions 2026-11-19 (after reading the deployed sheet-rag code, which has no structured extraction and keeps sheets as free-text chunks; city = Drive file name minus .xlsx, hotel = tab name): (A) the sheets are already synced on sheet-rag and the Drive folder is public, so the hotel-dictionary sync reads the same public Google pages itself with no credentials (folder listing, tab list, CSV export), configured by the plain var `DRIVE_FOLDER_ID` and optional var `SKIP_TABS`; an empty parse of the folder or of a tab list is an error, never a deletion; the real page format must be verified by the owner on the first run. (B) synced hotels are published automatically: `sync_auto_publish` defaults to 'true' and stays a setting the owner can flip; an existing hotel keeps its status and an owner-hidden hotel is never un-hidden. (C) cron stays hourly. (D) the row parser (TASK-58) is written from scratch and must fail safe: a tab it cannot parse is reported and never half-written.

Decision 2026-11-19: the sync is built standalone inside the `hotel-dictionary` worker (writes to its own D1), not in the old sheet-rag worker. The infrastructure tasks (TASK-45 to TASK-57) can proceed now. Only the row parser (TASK-58, AC2 to AC4 exact reading of rooms, prices, rules, images) stays blocked until the owner provides about 20 redacted rows from two tabs in different cities, plus how room-level booking rules and prices look (Q1).

## User need
As the project owner, I want the hotel data in my Excel sheets copied automatically into the database every hour, with prices and booking rules exact, so that the website and billing page always show what the sheets say without manual re-entry.

Decisions: .team/decision.md (2026-11-18, rows on data sources, booking rules and Phase 2 timing). Specification: implementation-plan.html (Phase 2, section 5), technical-design.html (sections 6 and 10).

## Scope
- In:
  - Each sheet file is a city and each tab is a hotel.
  - When a tab has changed at the hourly sync, the hotel is created or updated with: its rooms and prices (whole VND per night), image links, facilities and utilities, description, and booking rules at hotel level and at room level.
  - Booking rules are kept word for word with a sync date; they are never rewritten or summarised.
  - Records that fail validation are not published and are reported; valid records are published automatically.
  - A tab that disappears hides its hotel (it is not deleted).
  - Re-running with no change changes nothing.
  - The existing chat and search index keeps working as today.
  - Nothing from a failed record changes data already published.
- Out:
  - Mytour data (Version 2).
  - Review and approval screens (Version 2); reports are available to the owner but there is no editing tool.
  - Editing prices or rules in the database by hand.
  - Any change to the chat or search behaviour.
- Depends on STORY-12 and STORY-13.
- Sheet access: public Google pages, folder and sheets must be link-shared; no credentials.
- Blocked until the owner provides real sample rows; the validation rules and the layout of rooms, prices and room-level rules depend on them.

## Acceptance criteria
1. AC1: Given a sheet file and a tab, when the hotel is first synced, then a city is created from the file and a hotel from the tab, identified so that renaming the tab does not create a duplicate.
2. AC2: Given a changed tab with valid data, when the hourly sync runs, then the hotel's rooms, prices, image links, facilities, utilities and description are created or updated to match the sheet.
3. AC3: Given a room with a price in the sheet, when it is synced, then the price is stored as a whole number of VND per night, and a room without a price is stored with no price.
4. AC4: Given hotel-level and room-level booking rules in the sheet, when they are synced, then each is stored with its text exactly as in the sheet, attached to the hotel or to the right room, with the sync date.
5. AC5: Given a tab whose record is invalid (for example a price that is not a positive whole number, a star rating outside 1 to 5, a non-https image link, or the same room name twice), when it is synced, then the hotel is not published and the reason is reported.
6. AC6: Given a tab whose record is valid, when it is synced, then the hotel is published automatically with no manual step.
7. AC7: Given a hotel already published, when a later change to its tab is invalid, then the previously published data stays unchanged and the failure is reported.
8. AC8: Given a record that fails part-way, when the sync stops, then no partial data from that record is visible (all of the hotel's changes apply together or not at all).
9. AC9: Given a tab that is removed from the sheet file, when the next sync runs, then its hotel becomes hidden and is no longer public, and can be restored if the tab returns.
10. AC10: Given no sheet changes since the last sync, when the sync runs again, then no hotel, room, price or rule is changed.
11. AC11: Given one tab is edited, when the sync runs, then only that hotel is updated.
12. AC12: Given the sync runs, when search and chat are used, then they return the same kind of results as before this story.
13. AC13: Given the sync failed to read the sheet folder, when it stops, then nothing is removed or hidden.

## Linked files
- Tasks: [TASK-45](../tasks/TASK-45.md) migration 0003, [TASK-46](../tasks/TASK-46.md) SheetSource and PublicGoogleSource, [TASK-47](../tasks/TASK-47.md) CSV and hash, [TASK-48](../tasks/TASK-48.md) record and validation, [TASK-49](../tasks/TASK-49.md) change detection, [TASK-50](../tasks/TASK-50.md) hotel writer, [TASK-51](../tasks/TASK-51.md) rooms and rules writer, [TASK-52](../tasks/TASK-52.md) overrides and data_version, [TASK-53](../tasks/TASK-53.md) syncHotel, [TASK-54](../tasks/TASK-54.md) runSync and run log, [TASK-55](../tasks/TASK-55.md) /internal/sync route, [TASK-56](../tasks/TASK-56.md) wiring, [TASK-57](../tasks/TASK-57.md) extractor, [TASK-58](../tasks/TASK-58.md) rowParser (blocked: question)
- Test cases: TC-

## Questions
Q1: Sheet layout. To write exact rules for reading the sheets we need about 20 redacted rows from two tabs in different cities. Please also show: (a) how rooms and their nightly prices appear (one table, or free-form blocks; price written as plain number or with text such as "k" or "VND"); (b) how room-level booking rules appear versus hotel-level rules; (c) whether images are links in cells or pictures pasted into cells; (d) where star rating, address, facilities and description sit. A: (open, waiting for the owner)
