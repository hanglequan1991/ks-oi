# STORY-14: Sync hotels, rooms, prices and booking rules from the Excel sheets into the database

- id: STORY-14
- status: blocked        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

Blocked: waiting for sample sheet rows from the owner (about 20 redacted rows from two tabs in different cities, plus how room-level booking rules and prices look).

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
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Sheet layout. To write exact rules for reading the sheets we need about 20 redacted rows from two tabs in different cities. Please also show: (a) how rooms and their nightly prices appear (one table, or free-form blocks; price written as plain number or with text such as "k" or "VND"); (b) how room-level booking rules appear versus hotel-level rules; (c) whether images are links in cells or pictures pasted into cells; (d) where star rating, address, facilities and description sit. A: (open, waiting for the owner)
