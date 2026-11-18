# TC-4: Seeded settings hold the default fee, fee note and agreed disclaimer

- id: TC-4
- story: [STORY-13](../stories/STORY-13.md)
- verifies: AC3, AC4
- status: todo
- rework count: 0
- automation test file: `sheet-rag/e2e/TC-4.e2e.ts`
- runs without Cloudflare credentials: yes (local fake D1)

## Preconditions
- Same as TC-1.
- The expected texts are written as literals in the test, copied from implementation-plan.html section 5 (not read from any source or migration file).

## Steps
1. Create a fake D1 and run `applyMigrations(db)`.
2. `SELECT value FROM settings WHERE key = 'service_fee_percent'`.
3. Same for `show_fee_note`.
4. Same for `disclaimer_vi` and `disclaimer_en`.
5. Read all keys of `settings`.

## Expected results
1. Migration succeeds.
2. Value is exactly `10`.
3. Value is exactly `true`.
4. `disclaimer_en` equals exactly: `Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.` and `disclaimer_vi` equals exactly: `Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.` Comparison is strict: same Unicode characters (compare after confirming both strings are NFC), final full stop kept, no leading or trailing space.
5. The keys are exactly `service_fee_percent`, `show_fee_note`, `disclaimer_vi`, `disclaimer_en`, `data_version` (no phone or Zalo key in Version 1).

## Test data
- Texts as in expected result 4.

## QA notes
<!-- Written by qa. -->

## Review
<!-- Written by qalead. -->

## Questions
<!-- Q: ...   A: ... -->
