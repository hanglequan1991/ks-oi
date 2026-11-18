# STORY-11: Public billing page

- id: STORY-11
- status: todo        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

## User need
As a visitor or staff member, I want a simple page where I can list several hotels and rooms with nights and prices, add notes, and see the total, so that I can quickly prepare a stay estimate and print or save it as a PDF without creating an account.

Decisions: .team/decision.md (2026-11-18, billing page rows). Full specification: technical-design.html section 18.

## Scope
- In:
  - A public page at /bill (Vietnamese, default) and /en/bill (English). It is not part of the admin area and needs no sign-in.
  - The page is hidden: not linked anywhere on the site, not in the sitemap or robots.txt, and marked noindex.
  - A dynamic list (grid) with columns #, Hotel, Room, Night, Pricing, Total, and under each row a Note box (up to 500 characters) labelled only "NOTE" ("GHI CHÚ"), with no row number, aligned with the grid.
  - Hotel and Room as searchable dropdowns that also accept free text; accents are optional when searching; Room options depend on the chosen hotel.
  - Night (whole number 1 to 365, default 1); Pricing in VND with thousand separators, defaulting to the room's final price including the service fee, editable, with an "edited" marker and a reset to default; Total per row and a grand total.
  - Add row (maximum 30), remove row (at least one stays), clear all with confirmation.
  - The draft is remembered in the visitor's browser with a Clear button; nothing is stored on the server.
  - Print / Save as PDF through the browser with a dedicated print layout.
  - The call-to-confirm disclaimer (Vietnamese and English) and the fee note under the grid and on the printed bill.
  - A mobile layout where each row appears as a card.
- Out:
  - Server-side storage, saved bills or sharing links.
  - Server-generated PDF files.
  - Bookings, availability checks or payments.
  - Customer accounts.
  - A bill number or customer name field (open question below).
  - Booking rules (hotel or room level) on the page.
  - Currencies other than VND.

## Acceptance criteria
1. AC1: Given a visitor opens /bill, when the page loads, then it is shown in Vietnamese without any sign-in.
2. AC2: Given a visitor opens /en/bill, when the page loads, then all labels, the disclaimer and the fee note are shown in English.
3. AC3: Given any public page of the site (header, footer, menus, hotel pages), when its links are inspected, then none points to the billing page.
4. AC4: Given the sitemap and robots.txt, when they are read, then neither mentions /bill or /en/bill.
5. AC5: Given a visitor opens /bill or /en/bill, when the response is inspected, then the page is marked noindex so search engines do not index it.
6. AC6: Given a visitor who is not signed in to the admin area, when they open the billing page, then it works fully and no admin function is reachable from it.
7. AC7: Given the billing page opens for the first time, when it loads, then the grid shows exactly one empty row with Night = 1, and the columns #, Hotel, Room, Night, Pricing, Total.
8. AC8: Given any row, when it is displayed on desktop, then a Note box appears directly under it, labelled only "NOTE" (Vietnamese "GHI CHÚ") without a row number, with its left edge aligned with the Hotel column and its right edge with the Total column.
9. AC9: Given a Note box, when the visitor types more than 500 characters, then only the first 500 are kept.
10. AC10: Given a note or free text containing markup characters (for example angle brackets), when it is entered and later shown on screen or in print, then it appears as plain text and is never interpreted as markup.
11. AC11: Given the visitor types in the Hotel field, when matching published hotels exist, then a list of matching hotels is offered and the visitor can pick one.
12. AC12: Given a hotel whose name contains accents, when the visitor types its name without accents, then the hotel is still offered.
13. AC13: Given the visitor types a hotel name that is not in the list, when they leave the field, then the typed text is kept as the hotel (free text).
14. AC14: Given a row with a hotel picked from the list, when the visitor opens the Room field, then only rooms of that hotel are offered, and typing narrows them (accents optional).
15. AC15: Given a row with no hotel or a free-text hotel, when the visitor uses the Room field, then no list is offered and the visitor can type the room as free text.
16. AC16: Given a row with a hotel and a room chosen, when the visitor picks a different hotel, then the Room field is cleared.
17. AC17: Given a row whose price was not edited, when the visitor picks a hotel and room, then Pricing shows the room's final price including the service fee, with thousand separators, and never the base price.
18. AC18: Given a room that has no price, when it is picked, then Pricing is empty and the row Total shows a dash.
19. AC19: Given the Night field, when the visitor enters a value, then only digits are accepted and the value stays between 1 and 365.
20. AC20: Given the Pricing field, when the visitor types a number, then it is shown in VND with thousand separators, as a whole number of at most 10 digits.
21. AC21: Given a row with a default price, when the visitor types a different price, then the row shows an "edited" marker and a "use default price" action.
22. AC22: Given an edited price, when the visitor uses "use default price", then Pricing returns to the room's final price and the "edited" marker disappears.
23. AC23: Given an edited price, when the visitor picks a different room in the same row, then the edited price is kept.
24. AC24: Given a row with Night and Pricing, when either changes, then the row Total equals Night x Pricing immediately.
25. AC25: Given several rows, when any row changes, then the grand total equals the sum of all row totals, counting a row with an empty price as 0.
26. AC26: Given fewer than 30 rows, when the visitor chooses Add row, then a new empty row with Night = 1 is added at the end and numbered in sequence.
27. AC27: Given 30 rows, when the visitor looks at Add row, then no further row can be added.
28. AC28: Given more than one row, when the visitor removes a row, then it disappears, the remaining rows are renumbered and the grand total updates.
29. AC29: Given exactly one row, when the visitor looks at remove, then the last row cannot be removed.
30. AC30: Given a filled grid, when the visitor chooses Clear all, then a confirmation is asked, and only after confirming is the grid reset to one empty row; cancelling changes nothing.
31. AC31: Given the visitor has filled rows and notes, when they close and reopen the page in the same browser, then the rows, notes and edited prices are restored and a draft-saved message is shown.
32. AC32: Given a restored draft whose default prices have changed since it was saved, when the page restores it, then default prices of rows not edited are refreshed to the current final prices, and edited prices are kept.
33. AC33: Given a saved draft, when the visitor uses the Clear button for the draft, then the stored draft is removed and the grid is reset.
34. AC34: Given the visitor uses the page, when any data is entered, then nothing about the bill (including notes) is stored on or sent to the server.
35. AC35: Given the page content, when it is shown on desktop or mobile, then the disclaimer (calling to confirm prices and availability), the fee note and the contact phone with a call button appear under the grid, in the language of the page.
36. AC36: Given the visitor chooses Print / Save PDF, when the browser print view opens, then it shows a print layout with title, date, every row with its note under it, the grand total, the fee note, the disclaimer and the contact phone, and no buttons, input controls, or add or remove actions.
37. AC37: Given a note left empty, when the bill is printed, then no empty note box is shown for that row.
38. AC38: Given a screen narrower than about 720 px, when the page is shown, then each row appears as a card with its number and remove action, Hotel, Room, Night and Pricing, Total and Note, and all touch targets are at least 44 px high.
39. AC39: Given a visitor using only the keyboard, when they use the Hotel or Room dropdowns, then they can move through options, pick one and close the list without a mouse.
40. AC40: Given a browser with JavaScript disabled, when the page loads, then a message states that JavaScript is required.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: Should the printed bill carry a bill number and/or a customer name field? Currently out of scope. A: (open)
Q2: On mobile cards and in the printed bill, should the note label also drop the row number (as on the approved desktop layout), or may it show it? A: (open)
