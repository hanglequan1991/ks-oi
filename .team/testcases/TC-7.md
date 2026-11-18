# TC-7: Room price is a whole number of VND, and may be empty

- id: TC-7
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC8
- status: todo
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-7.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1. Insert a city and a hotel in the test.

## Steps
1. Insert a room with `base_price` 1250000.
2. Insert a room with `base_price` 0.
3. Insert a room with no price (omitted) and another with explicit NULL.
4. Try to insert rooms with `base_price` 1250000.5, `'abc'`, `-1000`.
5. Update an existing room to `base_price` 999.9.
6. Read all rooms' prices.

## Expected results
1. Succeeds; stored as integer 1250000.
2. Succeeds (zero is a whole number, not negative).
3. Both succeed; stored price is NULL (a room may have no price).
4. Each is rejected by the database (CHECK constraint) and no row is added.
5. Rejected; the old price stays.
6. Prices are exactly 1250000, 0, NULL, NULL; each non-null value has SQLite type `integer` (check with `typeof(base_price)`).

## Test data
- Valid: 1250000, 0, NULL. Invalid: 1250000.5, 'abc', -1000, 999.9.

## QA notes
<!-- Written by qa. -->

## Review
<!-- Written by qalead. -->

## Questions
<!-- Q: ...   A: ... -->
