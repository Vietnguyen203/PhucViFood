-- Thống kê đơn theo khách (chạy trên ordering_db).
-- Service customer lấy số liệu này qua API nội bộ của ordering, rồi phân loại bằng classifyCustomer()
-- (shared-library/utils/customer-segments.ts) với ngưỡng trong customer_db, bảng customer.settings.
-- Không join chéo database: phân loại khách TÍNH KHI TRUY VẤN, không lưu cột.
--
-- "Đơn hợp lệ" = đơn không ở trạng thái CANCELLED (6) hoặc RETURNED (7).
-- Trạng thái lưu dạng số (bảng mã đầy đủ ở docs/database.md, mục "Mã số enum").
SELECT
  o.customer_id,
  count(*)            AS valid_orders,
  sum(o.total_amount) AS total_spent,
  max(o.placed_at)    AS last_order_at
FROM ordering.orders o
WHERE o.status NOT IN (6, 7) -- CANCELLED, RETURNED
GROUP BY o.customer_id
ORDER BY total_spent DESC;
