# STORY-11: Hotel Dictionary lookup (search, filter, sort, browse, detail)

- id: STORY-11
- status: todo
- owner: product

## User need
As a guest looking for a hotel in Vietnam, I want to search, filter, sort and browse a public hotel directory and open a detail page for each hotel, in Vietnamese or English, so that I can compare hotels, rooms and final prices myself without chatting, and then call to book.

## Scope
- In: public, no-login directory page and hotel detail page, based on the approved design "Hotel Dictionary Mockup" (https://claude.ai/artifact/WQmnJPxXderWwmSJZBFS3R).
  - Directory: search form (free text "hotel name or area", city select, minimum stars select, Search button); facility filter chips; city tabs; sort select; "Load more hotels"; A-to-Z letter browse; hotel cards (city, name, stars, area, facility tags, "From <final price> / night", availability disclaimer, details link); empty-result state.
  - Detail page: image gallery, description, facilities, room table (type, furniture, guests, per-night final price), building info (floors, rooms, year built, distance to beach), global contact (call / Zalo), "more hotels in this city".
  - Vietnamese default with English toggle remembered in the browser; accent-insensitive Vietnamese search; mobile layout.
- Out: the chatbot (STORY-3, STORY-10); admin screens (STORY-7, 8, 9); importing data (STORY-2); fee configuration (STORY-8); booking, availability checks and payment (booking is by phone); per-hotel contacts (global only); currencies other than VND; user accounts, favourites, reviews; the /bill billing page (separate story candidate, not part of this story).
- Dependencies: STORY-2 (hotel, room, price and image data from Google Sheets); STORY-4 (final price calculation, rounding); STORY-8 (fee percentage); STORY-9 (global contact details). Related: STORY-1 (Docs, optional description source), STORY-10 (the public chat page; the directory is a separate public page).
- Decided earlier (not re-decided here): VND only; one flat base price per room type per night (STORY-2); fee is a percentage charged per night (STORY-4, STORY-8); price is rounded to the nearest 1,000 VND; information only, booking by phone (STORY-3); Vietnamese default plus English; one global contact set (STORY-9); data comes from the Google Sheets import and refreshes hourly (STORY-2).
- Decided by user: the guest sees the final price only (as in STORY-4), never the base price, fee percentage, fee amount or any fee note; the card price "From ..." is the lowest room final price; the list shows 12 hotels per page, "Load more hotels" adds 12 more; room furniture, floors, number of rooms, year built, distance to beach and facility tags are optional standard fields of STORY-2 (AC14) and are hidden when empty.
- Assumptions (default, unconfirmed): final price = base price x (1 + sum of applicable fee percentages / 100), rounded to nearest 1,000 VND, per STORY-4; star values are whole numbers 1 to 5; a letter in A-Z browse is the first letter of the hotel name with diacritics removed (Đ is its own letter after D); the A-Z "#" group holds names starting with a digit or symbol.

## Acceptance criteria
Search and matching
1. AC1: Given a hotel named "Đà Nẵng Beach Hotel" or in the area "Đà Nẵng", when the guest types "da nang" (no diacritics, any letter case), then the hotel is found; typing "Đà Nẵng" finds the same hotel.
2. AC2: Given a free-text query, when it is matched, then it matches against hotel name and area (a substring of either); leading, trailing and repeated spaces are ignored; an empty query matches all hotels.
3. AC3: Given the letters "đ" and "Đ", when matching, then "d" matches both "đ" and "Đ", and "dong" finds "Đông".
4. AC4: Given the city select, then it lists "All cities" first, then each distinct city found in the data once (accent-aware, sorted A to Z), and choosing one shows only hotels of that city.
5. AC5: Given the minimum stars select with options Any, 3+, 4+, 5, then Any shows all hotels, 3+ shows hotels with 3 or more stars, 4+ with 4 or more, and 5 with exactly 5; a hotel with no star rating is shown only for Any.

Filters
6. AC6: Given facility chips (pool, breakfast, parking, elevator, balcony, kitchen and any other facility present in the data), when the guest selects one chip, then only hotels having that facility are shown.
7. AC7: Given several facility chips are selected, then only hotels having all selected facilities are shown.
8. AC8: Given text query, city, minimum stars and facility chips are all set, then a hotel is shown only if it satisfies every one of them (AND).
9. AC9: Given the guest selects a city tab, then the list is limited to that city and the city select shows the same city; given the "All" tab, then no city restriction applies; the tabs are "All" plus one per city in the data.
10. AC10: Given the guest clears the filters, then all hotels are shown again.

Sorting
11. AC11: Given sort "Name A to Z", then hotels are ordered by name ignoring diacritics and letter case (Đ after D), with ties broken by city.
12. AC12: Given sort "Price low to high", then hotels are ordered by their "From" final price ascending; hotels without a valid price are placed last.
13. AC13: Given sort "Stars high to low", then hotels are ordered by stars descending, ties broken by name A to Z; hotels without stars are placed last.
14. AC14: Given no sort chosen, then the default is "Name A to Z".
15. AC15: Given a sort and filters are both active, then the sort is applied to the filtered result, and changing a filter keeps the chosen sort.

A-to-Z browse
16. AC16: Given the A-to-Z letter bar, then hotels are grouped by the first letter of their name with diacritics removed, "Đ" forming its own group placed after "D"; names starting with a digit or symbol go to a "#" group.
17. AC17: Given the letter bar, then a letter with no hotels is shown disabled and cannot be selected; counts and enabled letters reflect the current filters.
18. AC18: Given the guest selects a letter, then only hotels in that group are shown; selecting it again (or "All") removes the letter restriction.

Paging and empty state
19. AC19: Given more hotels match than the page size, then only the first page is shown with a "Load more hotels" button; each click adds the next page; the button disappears when all matches are shown.
20. AC20: Given the filters change, then paging restarts from the first page.
21. AC21: Given no hotel matches, then the page shows a clear "no hotels found" message in the current language with a way to clear the filters, and no "Load more hotels" button.
22. AC22: Given the data has no hotels at all, then the empty-state message is shown and the page does not error.

Price display
23. AC23: Given a room with base price B and applicable fees totalling p%, then its displayed final per-night price is B x (1 + p/100) rounded to the nearest 1,000 VND (for example B = 1,000,000 and p = 10 shows 1,100,000; B = 1,234,000 and p = 5 shows 1,296,000), using the STORY-4 rule; the raw base price is never shown.
24. AC24: Given a hotel with several rooms, then the card shows "From <lowest room final price> / night" in VND with thousands separators.
25. AC25: Given a hotel or room has no valid price, then no price is shown for it and the text "price unavailable / contact us" is shown instead; the hotel is still listed.
26. AC26 (replaced): Given any card, detail page or room table, then no fee note, "Includes X% service fee" text, fee percentage, fee amount or price breakdown is shown anywhere; only the final price appears.
27. AC27: Given a card or detail page, then the availability disclaimer is shown (prices are indicative and availability is confirmed by phone), and no booking button exists.

Hotel card
28. AC28: Given a hotel, then its card shows city, name, stars, area, facility tags, the price line, the disclaimer and a details link to that hotel's page.
29. AC29: Given a hotel has more facility tags than fit, then the card shows the first few and a "+N" indicator; the detail page shows all.

Detail page
30. AC30: Given a hotel with images, then the detail page shows a gallery of its image URLs from the sheet; an image that fails to load is hidden or replaced by a placeholder without breaking the page.
31. AC31: Given a hotel with no images, then a placeholder is shown instead of the gallery.
32. AC32: Given a hotel, then the detail page shows name, stars, city, area, address, description and all facilities; an empty field is omitted rather than shown blank.
33. AC33: Given a hotel with rooms, then the room table shows each room type with furniture, maximum guests and per-night final price (AC23), ordered by final price ascending; furniture is an optional STORY-2 field (AC14), and when it is empty the furniture is simply not shown for that room (no blank cell text or placeholder label).
34. AC34: Given building info is present (floors, number of rooms, year built, distance to beach; optional STORY-2 fields, AC14), then each present item is shown with its unit; missing items are omitted, and the building info section is hidden when all are empty.
35. AC35: Given the global contact details (STORY-9), then the detail page shows them with a tappable call link and a Zalo link; no per-hotel contact is shown; if no contact is configured the section is omitted.
36. AC36: Given a hotel in a city with other hotels, then "more hotels in this city" lists other hotels of the same city (never the current hotel), up to 4, each linking to its detail page; the section is hidden when there are none.
37. AC37: Given an unknown or removed hotel id in the address, then a "hotel not found" page with a link back to the directory is shown.

Language and layout
38. AC38: Given a first visit with no saved choice, then the page is in Vietnamese; given the guest switches to English, then all interface texts change to English and the choice is saved in the browser (localStorage) and applied on the next visit and on every page.
39. AC39: Given the saved language value is missing or invalid, then Vietnamese is used.
40. AC40: Given hotel content from the sheet (names, descriptions), then it is shown as imported and not translated.
41. AC41: Given a phone-sized screen, then the directory and detail pages are usable without horizontal scrolling, with filters collapsible and cards in one column.

Data freshness
42. AC42: Given a new import (STORY-2) has changed hotels, rooms, prices or fees, then the directory and detail pages show the new data on the next page load; given the data is stale or the last refresh failed, then the last good data is still shown.
43. AC43: Given a hotel has data rows skipped by the import (STORY-2 AC5), then the skipped rows do not appear, and the page does not error.

## Linked files
- Tasks (all `executor: local-dev`, one production file + one test file each; run serially in this order): [TASK-1](../tasks/TASK-1.md), [TASK-2](../tasks/TASK-2.md), [TASK-3](../tasks/TASK-3.md), [TASK-4](../tasks/TASK-4.md), [TASK-5](../tasks/TASK-5.md), [TASK-6](../tasks/TASK-6.md), [TASK-7](../tasks/TASK-7.md), [TASK-8](../tasks/TASK-8.md), [TASK-9](../tasks/TASK-9.md), [TASK-10](../tasks/TASK-10.md), [TASK-11](../tasks/TASK-11.md), [TASK-12](../tasks/TASK-12.md), [TASK-13](../tasks/TASK-13.md), [TASK-14](../tasks/TASK-14.md), [TASK-16](../tasks/TASK-16.md), [TASK-15](../tasks/TASK-15.md), [TASK-17](../tasks/TASK-17.md), [TASK-18](../tasks/TASK-18.md), [TASK-19](../tasks/TASK-19.md), [TASK-20](../tasks/TASK-20.md), [TASK-21](../tasks/TASK-21.md), [TASK-22](../tasks/TASK-22.md), [TASK-23](../tasks/TASK-23.md), [TASK-24](../tasks/TASK-24.md), [TASK-25](../tasks/TASK-25.md), [TASK-26](../tasks/TASK-26.md), [TASK-27](../tasks/TASK-27.md), [TASK-28](../tasks/TASK-28.md), [TASK-29](../tasks/TASK-29.md), [TASK-30](../tasks/TASK-30.md), [TASK-31](../tasks/TASK-31.md), [TASK-32](../tasks/TASK-32.md)
- Test cases: TC-

## Questions
Q1: The mockup shows furniture per room type, facilities, and building info (floors, number of rooms, year built, distance to beach). STORY-2's standard fields do not include these (it has amenities, max guests, description, images). Should STORY-2 be extended with: room furniture, number of floors, number of rooms, year built, distance to beach (metres), and a facility list split into separate tags? Recommended default: yes, add these as optional standard fields in STORY-2 (all optional; missing values are simply not shown, AC32 to AC34). Until confirmed, this story's AC33 and AC34 cannot be fully delivered.
A: Yes. Add them to STORY-2 as optional standard fields: room furniture, floors, number of rooms, year built, distance to beach (m), and facility tags/list. Empty ones are simply not shown. STORY-2 updated (scope, AC14); AC33/AC34 here depend on them. (answered by user)

Q2: The mockup card shows the fee note "Includes X% service fee", but the earlier decision (STORY-4 AC10, unconfirmed default) says the guest sees the final price only. Is it acceptable to show the total fee percentage as a note next to the final price (the base price is still never shown)? Recommended default: yes, show the note (as in the approved mockup); the base price and the per-fee breakdown stay hidden.
A: No. The guest sees the final price only, as in STORY-4. The "Includes X% service fee" note is removed everywhere; base price, fee percentage and fee amount are never shown. AC26 replaced accordingly (number kept). (answered by user)

Q3: The first story-level assumption is that the card "From" price is the lowest room final price and the page size is 12. Recommended default: accept both.
A: Accepted both: "From" price = the cheapest room's final price; 12 hotels per page before "Load more". (answered by user)
