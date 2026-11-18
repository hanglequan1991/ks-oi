# STORY-13: Hotel database foundation

- id: STORY-13
- status: todo        <!-- todo | in-progress | review | rework | done | blocked | blocked: question -->
- owner: product

## User need
As the project owner, I want a database ready to hold hotels, rooms, prices, booking rules and site settings with sensible defaults, so that the sheet sync, the API and the billing page have one reliable place to read and write data.

Decisions: .team/decision.md (2026-11-18, rows on fee, disclaimer, settings seeding). Specification: implementation-plan.html (Phase 1), technical-design.html (section 5).

## Scope
- In:
  - A D1 database schema and migration for cities, hotels, rooms, facilities, images, booking rules (hotel level and room level), settings and overrides.
  - Settings seeded by the migration with defaults: service fee 10 percent, fee note on, and the agreed disclaimer text in Vietnamese and English.
  - The migration applies cleanly on an empty database and is safe to run again.
  - The application can read the settings.
  - Hotels have a status (review, published, hidden); only published hotels are meant for public use.
- Out:
  - Any tool or page to edit settings (arrives with the admin page in Version 2).
  - Filling the tables with sheet data (STORY-14).
  - Mytour crawl tables and admin tables (Version 2).
  - Creating the real database on Cloudflare (the owner does this on their own machine).
- Depends on STORY-12 (worker source in the repo).

## Acceptance criteria
1. AC1: Given an empty database, when the migration runs, then it finishes with no errors and the tables for cities, hotels, rooms, facilities, images, booking rules, settings and overrides exist.
2. AC2: Given a database where the migration has already been applied, when it runs again, then it succeeds and no data or seeded setting is duplicated or lost.
3. AC3: Given a migrated database, when the settings are read, then the service fee is 10 percent and the fee note is on.
4. AC4: Given a migrated database, when the disclaimer settings are read, then the Vietnamese and English texts match the agreed wording in implementation-plan.html section 5.
5. AC5: Given a setting whose value was changed after seeding, when the migration is run again, then the changed value is kept.
6. AC6: Given the schema, when a hotel is stored, then it can have a status of review, published or hidden, and any other status is rejected.
7. AC7: Given the schema, when a booking rule is stored, then it can belong to a hotel only (hotel level) or to a hotel and one room (room level), and holds the original text unchanged with a sync date.
8. AC8: Given the schema, when a room price is stored, then it is a whole number of VND per night, and a room may have no price.
9. AC9: Given a hotel is removed from the database, when its dependent rows are checked, then its rooms, facilities, images and booking rules are removed with it.
10. AC10: Given the application code, when it asks for the settings, then it receives the fee percentage, fee-note flag and disclaimer texts, and a test with a local database proves this without Cloudflare credentials.

## Linked files
- Tasks: TASK-1 (test tooling, fake D1), TASK-2 (schema migration), TASK-3 (settings seed migration), TASK-4 (domain pricing), TASK-5 (db settings access)
- Test cases: TC-

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
