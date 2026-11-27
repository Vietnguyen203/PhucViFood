-- Thêm phương thức thanh toán VNPay (3). Như chuyển khoản QR: chưa trả UNPAID (2), rồi PAID (3) hoặc REFUNDED (4).
ALTER TABLE "ordering"."orders"
  DROP CONSTRAINT "orders_payment_method_chk",
  DROP CONSTRAINT "orders_payment_chk";
ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "orders_payment_method_chk" CHECK ("payment_method" IN (1, 2, 3)),
  ADD CONSTRAINT "orders_payment_chk" CHECK (
    ("payment_method" = 1 AND "payment_status" IN (1, 3, 4))
    OR ("payment_method" IN (2, 3) AND "payment_status" IN (2, 3, 4))
  );
