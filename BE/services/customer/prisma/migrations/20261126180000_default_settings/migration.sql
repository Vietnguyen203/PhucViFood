-- Ngưỡng phân loại khách mặc định. Dịch vụ không dùng giá trị dự phòng trong mã (thiếu ngưỡng thì báo lỗi thay vì phân loại sai),
-- nên database mới chỉ áp migration (không chạy seed) vẫn phải có đủ 5 ngưỡng, nếu không danh sách khách trả 500.
-- ON CONFLICT: database đã có ngưỡng (đã seed hoặc admin đã chỉnh) giữ nguyên, không ghi đè.
-- id dùng gen_random_uuid() (UUIDv4) vì migration không sinh được UUIDv7 như ứng dụng; chỉ 5 dòng cấu hình, không ảnh hưởng.
INSERT INTO "customer"."settings" ("id", "key", "value", "description", "updated_at") VALUES
  (gen_random_uuid(), 'segment.returning_min_orders', '2'::jsonb, 'Từ số đơn hợp lệ này trở lên là khách quen', now()),
  (gen_random_uuid(), 'segment.vip_min_orders', '5'::jsonb, 'Từ số đơn hợp lệ này là VIP', now()),
  (gen_random_uuid(), 'segment.vip_min_spend', '5000000'::jsonb, 'Hoặc tổng chi tiêu (VND) từ mức này là VIP', now()),
  (gen_random_uuid(), 'activity.active_days', '60'::jsonb, 'Đơn gần nhất trong N ngày: hoạt động', now()),
  (gen_random_uuid(), 'activity.at_risk_days', '120'::jsonb, 'Đơn gần nhất trong N ngày: sắp rời; vượt mức này là đã rời', now())
ON CONFLICT ("key") DO NOTHING;
