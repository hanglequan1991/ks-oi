# STORY-1: Import hotel information from public Google Docs

- id: STORY-1
- status: todo
- owner: product

## User need
As an admin, I want hotel information to be read from public read-only Google Docs, so that the chatbot answers from content the hotel team already maintains.

## Scope
- In: registering a Google Doc link as a hotel info source; reading its text; automatic hourly refresh plus a manual "refresh now"; showing import status and errors; a stale warning.
- Out: Google Sheets (STORY-2); writing back to Docs; private/authenticated Docs; images embedded in Docs; answering questions (STORY-3); the admin login (STORY-7).
- Dependencies: none for the import. Required by STORY-3. Admin screens need STORY-7.
- Assumption: until STORY-7 is delivered, sources can be registered by a non-UI means chosen by lead. Once STORY-7 exists, only signed-in admins may manage sources.
- Volume: up to 50 Docs, each up to 50 pages.

## Acceptance criteria
1. AC1: Given a valid public Google Doc link, when it is registered as a source, then the Doc's text content is imported and becomes available as hotel information.
2. AC2: Given a link that is not a Google Doc, is not public, or does not exist, when it is registered, then it is rejected with a clear reason and nothing is imported.
3. AC3: Given an imported Doc, when its content changes in Google and a refresh runs, then the system holds the new content and no longer serves the old content.
4. AC4: Given a refresh fails (Doc deleted, access revoked, Google unreachable), then the last good content is kept, the source is marked as failed with the reason and time, and the failure is visible to the admin.
5. AC5: Given several Docs are registered, when they are imported, then each Doc's content stays attributable to its source Doc.
6. AC6: Given an imported Doc, then the time of the last successful import is recorded and visible to the admin.
7. AC7: Given Vietnamese text with diacritics, when imported, then it is preserved exactly.
8. AC8: Given registered Docs, then they are refreshed automatically at least every 60 minutes without admin action.
9. AC9: Given an admin triggers "refresh now" for a source, then that source is re-imported immediately and its status updates.
10. AC10: Given a source has had no successful import for more than 24 hours, then the admin sees a stale warning and the bot keeps answering from the last good content.

## Linked files
- Tasks: TASK-
- Test cases: TC-

## Questions
Q1: How is a Doc tied to a hotel? Recommended default: one Doc may hold one or more hotels; the hotel name in the content identifies it, and the admin may label the source with a hotel name.
A: Default accepted. (answered by user: all data defaults accepted)

Q2: How often should data refresh, and is a manual "refresh now" required?
A: Hourly automatic refresh plus manual refresh for admins. (answered by user)

Q3: Expected volume? Recommended default: up to 50 Docs, each up to 50 pages.
A: Default accepted. (answered by user)

Q4: Do Docs contain images? Recommended default: images come from Sheet cells only; images embedded in Docs are out of scope.
A: Default accepted. (answered by user)
