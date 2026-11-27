-- Gắn đơn với tài khoản khách (nếu đặt khi đã đăng nhập) để khách xem lịch sử đơn của mình.
ALTER TABLE "ordering"."orders" ADD COLUMN "user_id" UUID;
CREATE INDEX "orders_user_id_placed_at_idx" ON "ordering"."orders"("user_id", "placed_at");
