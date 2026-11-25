-- Chuyển enum Postgres sang SMALLINT. Mã số lấy từ shared-library (contracts/codes.ts):
--   OrderStatus:       1 PLACED, 2 CONFIRMED, 3 SHIPPING, 4 DELIVERED, 5 COMPLETED, 6 CANCELLED, 7 RETURNED
--   PaymentMethod:     1 COD, 2 BANK_QR
--   PaymentStatus:     1 PENDING, 2 UNPAID, 3 PAID, 4 REFUNDED
--   AttributionSource: 1 LINK, 2 CODE
--   ReceivedBy:        1 CUSTOMER, 2 ADMIN
--   ActorType:         1 SYSTEM, 2 CUSTOMER, 3 ADMIN
--   ContactChannel:    1 CALL, 2 ZALO, 3 SMS
-- USING CASE giữ nguyên dữ liệu đang có; giá trị lạ cho NULL nên vi phạm NOT NULL và migration dừng lại.

-- Các CHECK và chỉ mục một phần đang so sánh với chữ phải gỡ trước, tạo lại bằng số ở cuối.
DROP INDEX "ordering"."orders_cskh_queue_idx";
ALTER TABLE "ordering"."orders"
  DROP CONSTRAINT "orders_payment_chk",
  DROP CONSTRAINT "orders_delivered_at_chk",
  DROP CONSTRAINT "orders_completed_chk",
  DROP CONSTRAINT "orders_cancelled_chk",
  DROP CONSTRAINT "orders_returned_chk";

ALTER TABLE "ordering"."orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "ordering"."orders"
  ALTER COLUMN "status" TYPE SMALLINT
    USING (CASE "status"::text WHEN 'PLACED' THEN 1 WHEN 'CONFIRMED' THEN 2 WHEN 'SHIPPING' THEN 3 WHEN 'DELIVERED' THEN 4
                               WHEN 'COMPLETED' THEN 5 WHEN 'CANCELLED' THEN 6 WHEN 'RETURNED' THEN 7 END),
  ALTER COLUMN "payment_method" TYPE SMALLINT
    USING (CASE "payment_method"::text WHEN 'COD' THEN 1 WHEN 'BANK_QR' THEN 2 END),
  ALTER COLUMN "payment_status" TYPE SMALLINT
    USING (CASE "payment_status"::text WHEN 'PENDING' THEN 1 WHEN 'UNPAID' THEN 2 WHEN 'PAID' THEN 3 WHEN 'REFUNDED' THEN 4 END),
  ALTER COLUMN "attribution_source" TYPE SMALLINT
    USING (CASE "attribution_source"::text WHEN 'LINK' THEN 1 WHEN 'CODE' THEN 2 END),
  ALTER COLUMN "received_by" TYPE SMALLINT
    USING (CASE "received_by"::text WHEN 'CUSTOMER' THEN 1 WHEN 'ADMIN' THEN 2 END);

ALTER TABLE "ordering"."orders" ALTER COLUMN "status" SET DEFAULT 1;

ALTER TABLE "ordering"."order_status_history"
  ALTER COLUMN "from_status" TYPE SMALLINT
    USING (CASE "from_status"::text WHEN 'PLACED' THEN 1 WHEN 'CONFIRMED' THEN 2 WHEN 'SHIPPING' THEN 3 WHEN 'DELIVERED' THEN 4
                                    WHEN 'COMPLETED' THEN 5 WHEN 'CANCELLED' THEN 6 WHEN 'RETURNED' THEN 7 END),
  ALTER COLUMN "to_status" TYPE SMALLINT
    USING (CASE "to_status"::text WHEN 'PLACED' THEN 1 WHEN 'CONFIRMED' THEN 2 WHEN 'SHIPPING' THEN 3 WHEN 'DELIVERED' THEN 4
                                  WHEN 'COMPLETED' THEN 5 WHEN 'CANCELLED' THEN 6 WHEN 'RETURNED' THEN 7 END),
  ALTER COLUMN "actor_type" TYPE SMALLINT
    USING (CASE "actor_type"::text WHEN 'SYSTEM' THEN 1 WHEN 'CUSTOMER' THEN 2 WHEN 'ADMIN' THEN 3 END);

ALTER TABLE "ordering"."care_notes"
  ALTER COLUMN "contact_channel" TYPE SMALLINT
    USING (CASE "contact_channel"::text WHEN 'CALL' THEN 1 WHEN 'ZALO' THEN 2 WHEN 'SMS' THEN 3 END);

DROP TYPE "ordering"."OrderStatus";
DROP TYPE "ordering"."PaymentMethod";
DROP TYPE "ordering"."PaymentStatus";
DROP TYPE "ordering"."AttributionSource";
DROP TYPE "ordering"."ReceivedBy";
DROP TYPE "ordering"."ActorType";
DROP TYPE "ordering"."ContactChannel";

-- Không còn enum của Postgres bảo vệ, nên giới hạn giá trị bằng CHECK.
ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "orders_status_chk" CHECK ("status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "orders_payment_method_chk" CHECK ("payment_method" IN (1, 2)),
  ADD CONSTRAINT "orders_payment_status_chk" CHECK ("payment_status" IN (1, 2, 3, 4)),
  ADD CONSTRAINT "orders_attribution_source_chk" CHECK ("attribution_source" IS NULL OR "attribution_source" IN (1, 2)),
  ADD CONSTRAINT "orders_received_by_chk" CHECK ("received_by" IS NULL OR "received_by" IN (1, 2)),
  -- COD (1): PENDING (1) / PAID (3) / REFUNDED (4). Chuyển khoản QR (2): UNPAID (2) / PAID (3) / REFUNDED (4).
  ADD CONSTRAINT "orders_payment_chk" CHECK (
    ("payment_method" = 1 AND "payment_status" IN (1, 3, 4))
    OR ("payment_method" = 2 AND "payment_status" IN (2, 3, 4))
  ),
  -- DELIVERED (4) và COMPLETED (5) phải có ngày giao.
  ADD CONSTRAINT "orders_delivered_at_chk"
    CHECK ("status" NOT IN (4, 5) OR "delivered_at" IS NOT NULL),
  -- COMPLETED (5) phải có ngày hoàn tất và người xác nhận.
  ADD CONSTRAINT "orders_completed_chk"
    CHECK ("status" <> 5 OR ("completed_at" IS NOT NULL AND "received_by" IS NOT NULL)),
  -- CANCELLED (6) phải có ngày hủy; RETURNED (7) phải có ngày hoàn.
  ADD CONSTRAINT "orders_cancelled_chk" CHECK ("status" <> 6 OR "cancelled_at" IS NOT NULL),
  ADD CONSTRAINT "orders_returned_chk" CHECK ("status" <> 7 OR "returned_at" IS NOT NULL);

ALTER TABLE "ordering"."order_status_history"
  ADD CONSTRAINT "order_status_history_from_chk" CHECK ("from_status" IS NULL OR "from_status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "order_status_history_to_chk" CHECK ("to_status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "order_status_history_actor_chk" CHECK ("actor_type" IN (1, 2, 3));

ALTER TABLE "ordering"."care_notes"
  ADD CONSTRAINT "care_notes_channel_chk" CHECK ("contact_channel" IS NULL OR "contact_channel" IN (1, 2, 3));

-- Hàng chờ CSKH: đơn DELIVERED (4) chưa COMPLETED, lâu nhất trước.
CREATE INDEX "orders_cskh_queue_idx"
  ON "ordering"."orders" ("delivered_at") WHERE "status" = 4;
