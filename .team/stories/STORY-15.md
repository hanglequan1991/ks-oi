# STORY-15: Hotel data API with final prices

- id: STORY-15
- status: todo        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

## User need
As a web page (and the visitor using it), I want read-only data endpoints for hotels, rooms, cities, suggestions and public settings that return final prices, so that pages such as the billing page can show correct prices without ever seeing the sheet base price.

Decisions: .team/decision.md (2026-11-18, rows on service fee, final price and Version 1 scope). Specification: implementation-plan.html (Phase 3, section 5), technical-design.html (sections 9, 11.3, 11.4, 18.4).

## Scope
- In:
  - Public read-only endpoints: hotel list with search and filters; hotel detail with rooms and booking rules; cities; a lightweight hotel suggestion endpoint for autocomplete (accent-insensitive prefix search); public settings.
  - Final price = sheet base price plus the configured service fee, rounded to the nearest 1,000 VND. Example: 1,250,000 with 10 percent becomes 1,375,000.
  - Only published hotels are returned.
  - Inputs are validated and limited.
- Out:
  - Any write endpoint.
  - Pages (billing page is STORY-11; directory and hotel pages are Version 2).
  - Phone number and Zalo link in the public settings (Version 2).
  - Rate limiting and security headers (STORY-16).
  - The existing search and chat routes (unchanged; see STORY-12).
- Depends on STORY-13 (database and settings). Data is filled by STORY-14; until then tests use prepared sample data.

## Acceptance criteria
1. AC1: Given published hotels exist, when the hotel list is requested, then it returns published hotels with their final prices, in pages, and never returns a hotel that is in review or hidden.
2. AC2: Given the hotel list, when the caller filters by city, star rating, facility or search text, then only matching published hotels are returned, and search text works without accents.
3. AC3: Given a page size above the allowed maximum or an invalid filter value, when the list is requested, then the request is rejected with a clear error, or the size is limited to the maximum of 50.
4. AC4: Given a published hotel, when its detail is requested, then it returns its facilities, images, rooms with final prices, and booking rules at hotel level and room level with their sync dates, text unchanged.
5. AC5: Given a hotel that is in review or hidden, or does not exist, when its detail is requested, then the answer is "not found".
6. AC6: Given a room with a base price of 1,250,000 and a fee of 10 percent, when the room is returned, then its price is 1,375,000 VND per night.
7. AC7: Given any response from any endpoint, when it is inspected, then the sheet base price does not appear anywhere in it.
8. AC8: Given a room with no price, when it is returned, then it carries no price (not zero).
9. AC9: Given the fee setting is changed in the database, when prices are requested again, then they use the new percentage; a fee outside 0 to 100 is treated as the nearest limit and a non-numeric fee falls back to 10.
10. AC10: Given the fee note setting is on, when a price is returned, then it states the fee percentage included; when off, the percentage is left out.
11. AC11: Given the cities endpoint is requested, when it answers, then it lists cities that have published hotels, with their names in both languages where available.
12. AC12: Given a suggestion request with 1 to 60 characters, when it is made, then it returns up to the requested limit (1 to 10, default 8) of published hotels whose name starts with the text, accents optional, each with slug, name and city.
13. AC13: Given a suggestion request that is empty, longer than 60 characters, or contains search-syntax characters, when it is made, then it is rejected or handled safely with no error and no effect on the query.
14. AC14: Given the public settings endpoint, when it is requested, then it returns the disclaimer text in Vietnamese and English, the fee-note flag and the fee percentage, and no phone number or Zalo link in Version 1.

## Linked files
- Tasks: [TASK-16](../tasks/TASK-16.md) (sample data fixture), [TASK-17](../tasks/TASK-17.md) (accent folding, LIKE patterns; AC2/12/13), [TASK-18](../tasks/TASK-18.md) (serializers, final price, no base price; AC4/6/7/8/10/11), [TASK-19](../tasks/TASK-19.md) (parameter validation; AC3/12/13), [TASK-20](../tasks/TASK-20.md) (hotel list query; AC1/2), [TASK-21](../tasks/TASK-21.md) (hotel detail query; AC4/5), [TASK-22](../tasks/TASK-22.md) (cities and suggest queries; AC11/12/13), [TASK-23](../tasks/TASK-23.md) (hotel routes; AC1-10), [TASK-24](../tasks/TASK-24.md) (cities, suggest, config routes; AC11-14), [TASK-25](../tasks/TASK-25.md) (mount function and end-to-end sweep; AC7/9)
- Test cases: [TC-25](../testcases/TC-25.md) (list, published only, paging; AC1), [TC-26](../testcases/TC-26.md) (filters, accents; AC2), [TC-27](../testcases/TC-27.md) (invalid params, cap 50; AC3), [TC-28](../testcases/TC-28.md) (detail; AC4), [TC-29](../testcases/TC-29.md) (not found; AC5), [TC-30](../testcases/TC-30.md) (final price, null price; AC6/8), [TC-31](../testcases/TC-31.md) (fee setting, clamp, fallback; AC9), [TC-32](../testcases/TC-32.md) (fee note; AC10), [TC-33](../testcases/TC-33.md) (cities; AC11), [TC-34](../testcases/TC-34.md) (suggest; AC12), [TC-35](../testcases/TC-35.md) (suggest bad input; AC13), [TC-36](../testcases/TC-36.md) (config; AC14), [TC-37](../testcases/TC-37.md) (no base price anywhere; AC7), [TC-38](../testcases/TC-38.md) (read-only, no leaks, guards; AC1/5/9), [TC-39](../testcases/TC-39.md) (LIVE deployment; needs Cloudflare)

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
