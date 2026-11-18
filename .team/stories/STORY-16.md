# STORY-16: Shared page foundation and public protection

- id: STORY-16
- status: todo        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

## User need
As a visitor, I want pages that open in Vietnamese by default, can be switched to English and remember my choice, and always carry the call-to-confirm notice with any price; as the project owner, I want the public endpoints protected against abuse, so that every Version 1 page is consistent, legally cautious and safe to expose.

Pulled forward from Version 2 (Phase 4 layout, languages, disclaimer; Phase 7 rate limiting and noindex). Decisions: .team/decision.md (2026-11-18, rows on languages, disclaimer and Version 1 scope). Specification: technical-design.html (sections 9, 11.5, 12, 13).

## Scope
- In:
  - A shared page layout used by all Version 1 pages.
  - Vietnamese by default at the normal address; English under /en/.
  - The visitor's language choice remembered in the browser.
  - The call-to-confirm disclaimer (Vietnamese and English) and the fee note as shared components that every price display includes.
  - noindex headers on the Version 1 pages.
  - Rate limiting on the public endpoints, including search, chat and suggestions.
  - Basic security headers.
- Out:
  - The directory, city and hotel detail pages (Version 2).
  - The billing page itself (STORY-11).
  - Editing the disclaimer or fee note text (Version 2 admin page).
  - Admin sign-in protection (Version 2).
  - Lawyer review of the wording (before launch, outside this story).
- Depends on STORY-13 and STORY-15 for the texts and fee note flag. Overlaps the older chat page in STORY-10, which is not changed.

## Acceptance criteria
1. AC1: Given a visitor opens a page at its normal address, when it loads, then it is shown in Vietnamese and declares Vietnamese as its language.
2. AC2: Given a visitor opens the same page under /en/, when it loads, then it is shown in English and declares English as its language.
3. AC3: Given a visitor switches language, when they reload or return later in the same browser, then their choice is remembered and they land on the matching language version.
4. AC4: Given a first visit with nothing stored, when the page loads, then it stays in Vietnamese.
5. AC5: Given the browser blocks storage, when the visitor uses the page, then it still works in the language of the address.
6. AC6: Given any language version, when its text is checked, then every label exists in both Vietnamese and English.
7. AC7: Given any page that shows a price, when it is displayed, then the call-to-confirm disclaimer appears in the page language, and no page can show a price without it.
8. AC8: Given the fee note setting is on, when a price is shown, then the note "Includes 10% service fee" (percentage from settings) appears in the page language; when off, it does not.
9. AC9: Given any Version 1 page, when its response is inspected, then it carries a noindex instruction.
10. AC10: Given a client sends more requests to a public endpoint (search, chat, suggestions, hotel data) than the allowed rate, when the limit is exceeded, then further requests are refused with a "too many requests" answer, and normal use is not affected.
11. AC11: Given a client has been rate limited, when the waiting period ends, then requests are accepted again.
12. AC12: Given any page or endpoint response, when its headers are inspected, then basic security headers are present (content type protection, referrer policy, transport security and a content policy allowing only the site's own scripts and styles and secure images).
13. AC13: Given the chat or search endpoints, when they receive overly long input, then they refuse it before calling the AI service.

## Linked files
- Tasks: [TASK-6](../tasks/TASK-6.md) (setup: hono, JSX, test globs), [TASK-7](../tasks/TASK-7.md) (i18n, AC1/2/4/6/8), [TASK-8](../tasks/TASK-8.md) (Disclaimer, FeeNote, PriceBlock, AC7/8), [TASK-9](../tasks/TASK-9.md) (Layout, renderPage guard, AC1/2/4/7/8/9), [TASK-10](../tasks/TASK-10.md) (lang.js, AC3/4/5), [TASK-11](../tasks/TASK-11.md) (security headers, noindex, AC9/12), [TASK-12](../tasks/TASK-12.md) (rate limit, AC10/11), [TASK-13](../tasks/TASK-13.md) (input cap, AC13), [TASK-14](../tasks/TASK-14.md) (app composition, all ACs end to end), [TASK-15](../tasks/TASK-15.md) (wiring into real index.ts; blocked until the owner commits the real source)
- Test cases: TC-11 (vi/en pages, AC1/2/4), TC-12 (language memory, AC3), TC-13 (first visit, AC4), TC-14 (blocked storage, AC5), TC-15 (dictionary parity, AC6), TC-16 (disclaimer, AC7), TC-17 (fee note, AC8), TC-18 (noindex, AC9), TC-19 (security headers and CSP, AC12), TC-20 (rate limit, AC10), TC-21 (recovery after window, AC11), TC-22 (input cap, AC13), TC-23 (LIVE, wiring, AC1/2/3/9/12/13), TC-24 (LIVE, real rate limiter, AC10/11)

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
