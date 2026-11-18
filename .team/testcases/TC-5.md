# TC-5: Hotel status accepts review, published, hidden and rejects anything else

- id: TC-5
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC6
- status: todo
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-5.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1. A city row exists (insert one in the test).

## Steps
1. Migrate a fresh fake D1 and insert a city.
2. Insert three hotels with status `review`, `published`, `hidden`.
3. Insert a hotel without giving a status.
4. Try to insert hotels with status `live`, `Published` (different case), empty string `''`, and NULL.
5. Update an existing hotel to status `archived`.
6. Count hotels per status.

## Expected results
1. Setup succeeds.
2. All three inserts succeed.
3. The insert succeeds and the stored status is `review` (default).
4. Each of the four inserts is rejected with a constraint error and no row is added.
5. The update is rejected; the hotel keeps its old status.
6. There are 2 `review` hotels (explicit plus default), 1 `published`, 1 `hidden`, and no other value.

## Test data
- Valid: review, published, hidden. Invalid: live, Published, '', NULL, archived.

## QA notes
<!-- Written by qa. -->
- Automated in `sheet-rag/e2e/TC-5.e2e.ts` (Node-only, local fake D1, chromium project only).
- Run: `npx playwright test -c playwright.node.config.ts e2e/TC-5.e2e.ts --trace off --project=chromium` (in `sheet-rag/`): 1 passed.
- Invalid inserts are checked with `/constraint failed/i` (CHECK or NOT NULL). Row count stays at 4 after the rejected inserts.
- No product bugs found.

## Review
<!-- Written by qalead. -->

## Questions
<!-- Q: ...   A: ... -->
