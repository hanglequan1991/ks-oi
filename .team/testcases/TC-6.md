# TC-6: Booking rules at hotel level and room level keep original text and sync date

- id: TC-6
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC7
- status: done
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-6.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1. Insert a city, a hotel and a room in the test.

## Steps
1. Insert a hotel-level rule (`room_id` NULL) with `raw_text` = `  Huy phòng trước 3 ngày.\nKhông hoàn tiền nếu đến muộn.  ` (leading and trailing spaces, newline, diacritics) and a `synced_at` value.
2. Insert a room-level rule (valid `room_id`) with its own text and `synced_at`.
3. Read both rules back.
4. Try to insert a rule without `raw_text`.
5. Try to insert a rule without `synced_at`.
6. Try to insert a rule with a `room_id` that does not exist (for example 99999).
7. Try to insert a rule with a `hotel_id` that does not exist.

## Expected results
1. Insert succeeds.
2. Insert succeeds.
3. Hotel-level rule has `room_id` NULL; room-level rule has the room id; `raw_text` is byte-for-byte identical to what was inserted (no trim, no normalisation of newlines); `synced_at` is the value given.
4. Rejected (NOT NULL constraint).
5. Rejected (NOT NULL constraint).
6. Rejected (foreign key, since foreign keys are on as in D1).
7. Rejected (foreign key).

## Test data
- raw_text as in step 1; `synced_at` e.g. `2026-11-18T10:00:00Z`.

## QA notes
<!-- Written by qa. If the schema has no explicit check that room belongs to the same hotel, note it here as an observation (not required by the story). -->
- Automated in `sheet-rag/e2e/TC-6.e2e.ts`; passes on chromium (node-only, fake D1).
- Observation: `booking_rules` has FKs to `hotels(id)` and `rooms(id)` but no check that the room belongs to the same hotel as the rule. In `migrations/0001_init.sql` a rule with `hotel_id` = hotel A and `room_id` = a room of hotel B is accepted. Not tested (not required by the story). The test does not cover this case.

## Review
Verdict: approve

- Re-ran `npx playwright test -c playwright.node.config.ts e2e/TC-6.e2e.ts --trace off --project=chromium`: 1 passed.
- Follows steps 1-7 in order. Asserts room_id NULL vs room id, raw_text equal to the inserted string (also byte-equal via Buffer), synced_at kept for both rules, and constraint errors for steps 4-7 with row count unchanged (2).
- No sleeps, only touches its own test file, uses its own fake D1.
- Minor, not blocking: step 6 binds "99999" as a string since room_id is TEXT; acceptable.
- Observation (report only): the missing check that a rule's room belongs to the same hotel is a real, low-to-medium gap. It lets a rule carry hotel A with a room of hotel B, so a rule could show up on the wrong hotel page or be answered for the wrong hotel in RAG. Not required by AC7, and the sync code is the only writer, so it is worth one small follow-up task for lead: add a composite FK (rooms UNIQUE (id, hotel_id) and booking_rules FOREIGN KEY (room_id, hotel_id)) or a trigger, plus a TC for it.

## Questions
<!-- Q: ...   A: ... -->
