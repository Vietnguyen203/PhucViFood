-- Hàng chờ CSKH (chạy trên commerce_db):
-- đơn DELIVERED chưa COMPLETED, đơn giao lâu nhất lên đầu, kèm ghi chú liên hệ gần nhất.
-- Trạng thái lưu dạng số: 4 = DELIVERED (bảng mã đầy đủ ở docs/database.md, mục "Mã số enum").
SELECT
  o.code,
  o.ship_name,
  o.delivered_at,
  floor(extract(epoch FROM (now() - o.delivered_at)) / 86400)::int AS days_waiting,
  o.total_amount,
  (SELECT count(*) FROM ordering.care_notes n WHERE n.order_id = o.id) AS note_count,
  (SELECT n.note FROM ordering.care_notes n WHERE n.order_id = o.id
     ORDER BY n.contacted_at DESC LIMIT 1) AS last_note
FROM ordering.orders o
WHERE o.status = 4 -- DELIVERED
ORDER BY o.delivered_at ASC;
