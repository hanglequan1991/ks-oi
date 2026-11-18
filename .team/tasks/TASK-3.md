# TASK-3: Seed default settings migration 0002_seed_settings.sql

- id: TASK-3
- story: [STORY-13](../stories/STORY-13.md)
- type: backend        <!-- frontend | backend -->
- status: done
- assignee: dev
- rework count: 0
- depends on: TASK-2 (needs the `settings` table; tests apply 0001 then 0002)
- size: fits a 100k-token context (few files, one behaviour)

## Why
Seeds the settings with defaults per decision.md (2026-11-18: fee 10 percent, fee note on, disclaimer in both languages, no editing tool in Version 1). Settings keys (fixed, other tasks rely on them):
- `service_fee_percent` = `10`
- `show_fee_note` = `true`
- `disclaimer_vi` = `Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.`
- `disclaimer_en` = `Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.`
- `data_version` = `1`

The texts must be copied character for character from implementation-plan.html section 5 (keep the final full stop, no trailing space). Phone and Zalo settings are NOT seeded: no value was agreed and the billing page does not show them in Version 1 (decision 2026-11-18); they arrive with the admin page.

Seeding must use `INSERT OR IGNORE INTO settings (key, value) VALUES ...` (never `INSERT OR REPLACE`, never `ON CONFLICT DO UPDATE`), so an edited value survives a re-run. Escape single quotes if any (none expected).

## Acceptance criteria
1. AC2: Given the migrations have been applied, when `0001` and `0002` run again, then both succeed and there is still exactly one row per seeded key (5 rows, no duplicates).
2. AC3: Given a migrated database, then `service_fee_percent` is `10` and `show_fee_note` is `true`.
3. AC4: Given a migrated database, then `disclaimer_vi` and `disclaimer_en` equal the exact agreed texts above.
4. AC5: Given `service_fee_percent` was changed to `12` and `show_fee_note` to `false` after seeding, when the migrations are run again, then `12` and `false` are kept, and a changed disclaimer text is kept too.

## Unit tests to write
All in `test/migrations/0002_seed_settings.spec.ts`. Write the expected disclaimer strings as literals in the test (copied from implementation-plan.html), not imported from any source file.
- [ ] `seeds fee 10 and fee note true on an empty database`: covers AC3
- [ ] `seeds Vietnamese and English disclaimer exactly`: covers AC4
- [ ] `re-running all migrations leaves exactly one row per key`: covers AC2
- [ ] `re-running keeps a changed fee, fee note and disclaimer`: covers AC5
- [ ] `seeds data_version 1 and no phone or zalo keys`: covers AC3 (guards the scope decision)

## Files this task may touch
- `sheet-rag/migrations/0002_seed_settings.sql` (new)
- `sheet-rag/test/migrations/0002_seed_settings.spec.ts` (new)

## Dev notes
<!-- Written by dev: anything the reviewer should know. -->
- Red: test failed first with ENOENT on migrations/0002_seed_settings.sql.
- Green: 0002_seed_settings.sql uses INSERT OR IGNORE with the 5 keys. Disclaimer texts copied from implementation-plan.html lines 338-339 (no HTML entities present).
- `test/migrations/0002_seed_settings.spec.ts`: 5/5 pass.
- Full suite: 44 tests pass. `test/web/i18n/t.spec.ts` fails to load; not in this task's files, not investigated.

## Review
Verdict: **approve**
- All 4 ACs are covered by the 5 named tests. 5/5 pass (full suite 49/49 at review time).
- Disclaimer texts in the SQL and in the spec literals match implementation-plan.html lines 338-339 character for character.
- Uses `INSERT OR IGNORE`, 5 keys, no phone or Zalo keys. Only the two listed files are in scope.

## Questions
<!-- Q: ...   A: ... (answer goes right under the question) -->
