# TC-8: Removing a hotel removes its rooms, facilities, images and booking rules

- id: TC-8
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC9
- status: done
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-8.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1, foreign keys on)

## Preconditions
- Same as TC-1.

## Steps
1. Migrate a fresh fake D1. Insert one city and two facility_catalog entries.
2. Insert hotel A with 2 rooms, 2 hotel_facilities links, 2 images, one hotel-level rule and one room-level rule.
3. Insert hotel B with 1 room, 1 facility link, 1 image, 1 hotel-level rule.
4. Delete hotel A.
5. Count rows of rooms, hotel_facilities, hotel_images and booking_rules for hotel A and for hotel B; count cities and facility_catalog.
6. Edge: delete one room of hotel B that has a room-level rule (add one first), then count its rules.

## Expected results
1. Setup succeeds.
2. Inserts succeed.
3. Inserts succeed.
4. Delete succeeds (not blocked by a foreign key).
5. Hotel A has 0 rooms, 0 facility links, 0 images and 0 rules. Hotel B is untouched (1 room, 1 link, 1 image, its rules). The `cities` row and both `facility_catalog` rows remain.
6. The room-level rule of that room is gone; hotel B's hotel-level rule remains.

## Test data
- Two hotels as above; counts as in expected results.

## QA notes
<!-- Written by qa. -->
- Automated in `sheet-rag/e2e/TC-8.e2e.ts` (Node-only, fake D1 with migrations, foreign keys on). One test covers steps 1-6 and all expected results.
- Run: `npx playwright test -c playwright.node.config.ts e2e/TC-8.e2e.ts --trace off --project=chromium` (inside `sheet-rag/`): 1 passed.
- Relies on the `ON DELETE CASCADE` foreign keys in `migrations/0001_init.sql` for hotel and room deletes. No product bugs found.

## Review
<!-- Written by qalead. -->
Verdict: approve

- Ran `npx playwright test -c playwright.node.config.ts e2e/TC-8.e2e.ts --trace off --project=chromium` in `sheet-rag/`: 1 passed.
- Steps 1-6 are followed in order, and every expected result is asserted: hotel A has 0 rooms, links, images and rules; hotel B keeps 1 room, 1 link, 1 image and 1 rule; `cities` has 1 row and `facility_catalog` has 2; the room-level rule is gone after the room delete while hotel B's hotel-level rule remains.
- Foreign keys are really enabled: `test/fakes/d1.ts` runs `PRAGMA foreign_keys = ON`, and `0001_init.sql` has `ON DELETE CASCADE` on all child tables. The pre-delete sanity counts show the rows existed, so the zero counts are meaningful.
- No sleeps, no browser selectors, and the test touches only its own file.

## Questions
<!-- Q: ...   A: ... -->
