-- migrations/0002_seed_settings.sql
-- Default settings (decision 2026-11-18, implementation-plan.html section 5).
-- INSERT OR IGNORE: a re-run never overwrites a value an admin has changed.
-- Phone and Zalo are not seeded: no value agreed, not shown in Version 1.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('service_fee_percent', '10'),
  ('show_fee_note', 'true'),
  ('disclaimer_vi', 'Giá và tình trạng phòng thay đổi theo số phòng còn lại và báo cáo từ khách sạn, chúng tôi không cam kết, vui lòng gọi điện để xác nhận trước khi đặt phòng.'),
  ('disclaimer_en', 'Prices and room availability change with the rooms remaining and hotel reports and are not guaranteed, so please call us to confirm before booking.'),
  ('data_version', '1');
