# STORY-2: Import hotel info, base prices and images from Google Sheets

- id: STORY-2
- status: todo
- owner: product

## User need
As an admin, I want to import hotel info, base prices and image links from Google Sheets with differing layouts and multiple tabs, so that the chatbot can use the data the hotel teams already keep.

## Scope
- In: registering a Google Sheets link (public, read-only); reading every tab; mapping each tab's columns to standard fields (hotel name, city/area, address, star rating, room type, base price, price unit per night, max guests, amenities, description, image URL(s)); saving the mapping; automatic hourly refresh plus manual refresh; reporting import status, row-level errors and a stale warning.
- Out: writing to Sheets; private Sheets; Google Docs (STORY-1); add-on fees (STORY-4/8); per-hotel contact details (contacts are global only, STORY-9); seasonal or date-based pricing; images embedded in the Sheet; currencies other than VND; the admin login (STORY-7).
- Dependencies: none for the import. Required by STORY-3 and STORY-4. Mapping screens for admins need STORY-7.
- Assumption: the Sheet price is one flat VND base price per room type per night, and is never shown to guests without the add-on fees (see STORY-4).

## Acceptance criteria
1. AC1: Given a valid public Google Sheets link, when it is registered, then all its tabs are discovered and listed.
2. AC2: Given a file with several tabs, when imported, then data from every tab that has a mapping is imported, and each record keeps its file and tab as its source.
3. AC3: Given two tabs with different column names or order, when each has its own column mapping, then both import into the same standard fields correctly.
4. AC4: Given a tab with no mapping, then it is reported as "not mapped" and is not imported.
5. AC5: Given a mapped tab, when a row has a missing or non-numeric price or a missing hotel name, then that row is skipped, reported with its tab and row number, and valid rows are still imported.
6. AC6: Given a price cell formatted in common Vietnamese styles (for example "1.200.000", "1,200,000", "1.2tr", with or without "VND" or "đ"), when imported, then the base price is stored as a correct number in VND.
7. AC7: Given an image column with one or more public image URLs (including public Google Drive share links), when imported, then the URLs are stored against the hotel or room.
8. AC8: Given a source changes in Google and a refresh runs, then the new data replaces the old; rows removed from the Sheet no longer appear.
9. AC9: Given a refresh fails, then the last good data is kept, and the failure and its reason are visible to the admin.
10. AC10: Given an unreachable, non-public or non-Sheet link, when registered, then it is rejected with a clear reason.
11. AC11: Given registered Sheets, then they are refreshed automatically at least every 60 minutes, and an admin can also trigger "refresh now".
12. AC12: Given a source has had no successful import for more than 24 hours, then the admin sees a stale warning and the bot keeps answering from the last good data.
13. AC13: Given a tab has no column mapped to a contact field, then no per-hotel contact data is imported (contacts are global only).

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: How are columns mapped? Recommended default: the admin maps each tab's columns once (saved per tab), with automatic suggestions from header names; unmapped tabs are not imported.
A: Default accepted. (answered by user: all data defaults accepted)

Q2: Standard fields?
A: Hotel name, city/area, address, star rating, room type, base price, price unit (per night), max guests, amenities, description, image URL(s). The optional per-hotel "contact override" column is removed. (answered by user)

Q3: Seasonal pricing?
A: No. One flat price per room type. (answered by user)

Q4: Currency? Recommended default: VND only.
A: Default accepted. (answered by user)

Q5: Images?
A: Public URLs in sheet cells only. (answered by user)

Q6: Refresh and stale handling?
A: Hourly refresh plus manual; admin stale warning after 24 hours without a successful import; bot still answers. (answered by user)
