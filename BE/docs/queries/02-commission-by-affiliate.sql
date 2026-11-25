-- Hoa hồng theo CTV, tách theo trạng thái (chạy trên affiliate_db). Tiền: VND.
-- Còn phải trả = CONFIRMED (đã xác nhận, chưa chi). ESTIMATED chỉ là dự kiến.
SELECT
  a.referral_code,
  a.full_name,
  count(c.id)                                                          AS commissions,
  coalesce(sum(c.amount) FILTER (WHERE c.status = 'ESTIMATED'), 0)     AS estimated,
  coalesce(sum(c.amount) FILTER (WHERE c.status = 'CONFIRMED'), 0)     AS confirmed_unpaid,
  coalesce(sum(c.amount) FILTER (WHERE c.status = 'PAID'), 0)          AS paid,
  coalesce(sum(c.amount) FILTER (WHERE c.status = 'CANCELLED'), 0)     AS cancelled
FROM affiliate.affiliates a
LEFT JOIN commission.commissions c ON c.affiliate_id = a.id
GROUP BY a.id, a.referral_code, a.full_name
ORDER BY a.referral_code;

-- Đối chiếu: tổng đợt chi trả phải bằng tổng hoa hồng PAID của đợt đó (kỳ vọng 0 dòng lệch).
SELECT p.id AS payout_id, p.total_amount, coalesce(sum(c.amount), 0) AS sum_commissions
FROM commission.payouts p
LEFT JOIN commission.commissions c ON c.payout_id = p.id
GROUP BY p.id, p.total_amount
HAVING p.total_amount <> coalesce(sum(c.amount), 0);
