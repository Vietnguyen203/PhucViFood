-- Phân loại khách tính khi truy vấn (chạy trên commerce_db), ngưỡng đọc từ customer.settings.
-- Lưu ý: truy vấn join hai schema customer và ordering. Khi tách thành service riêng,
-- thay bằng API thống kê đơn hoặc projection (xem BE/docs/database.md).
-- "Đơn hợp lệ" = đơn không ở trạng thái CANCELLED hoặc RETURNED.
WITH cfg AS (
  SELECT
    (SELECT (value #>> '{}')::int    FROM customer.settings WHERE key = 'segment.returning_min_orders') AS returning_min_orders,
    (SELECT (value #>> '{}')::int    FROM customer.settings WHERE key = 'segment.vip_min_orders')       AS vip_min_orders,
    (SELECT (value #>> '{}')::bigint FROM customer.settings WHERE key = 'segment.vip_min_spend')        AS vip_min_spend,
    (SELECT (value #>> '{}')::int    FROM customer.settings WHERE key = 'activity.active_days')         AS active_days,
    (SELECT (value #>> '{}')::int    FROM customer.settings WHERE key = 'activity.at_risk_days')        AS at_risk_days
),
stats AS (
  SELECT
    c.id, c.full_name, c.province, c.first_channel_code,
    count(o.id)                       AS valid_orders,
    coalesce(sum(o.total_amount), 0)  AS total_spent,
    max(o.placed_at)                  AS last_order_at
  FROM customer.customers c
  LEFT JOIN ordering.orders o
    ON o.customer_id = c.id AND o.status NOT IN ('CANCELLED', 'RETURNED')
  GROUP BY c.id
)
SELECT
  s.full_name,
  s.province,
  CASE WHEN s.first_channel_code IS NULL THEN 'direct' ELSE s.first_channel_code END AS first_source,
  s.valid_orders,
  s.total_spent,
  CASE
    WHEN s.valid_orders >= cfg.vip_min_orders OR s.total_spent >= cfg.vip_min_spend THEN 'VIP'
    WHEN s.valid_orders >= cfg.returning_min_orders THEN 'RETURNING'
    ELSE 'NEW'
  END AS tier,
  CASE
    WHEN s.last_order_at IS NULL THEN 'NONE'
    WHEN now() - s.last_order_at <= make_interval(days => cfg.active_days)  THEN 'ACTIVE'
    WHEN now() - s.last_order_at <= make_interval(days => cfg.at_risk_days) THEN 'AT_RISK'
    ELSE 'CHURNED'
  END AS activity,
  s.last_order_at::date AS last_order_date
FROM stats s CROSS JOIN cfg
ORDER BY s.total_spent DESC;
