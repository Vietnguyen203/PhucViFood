-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ordering";

-- CreateTable
CREATE TABLE "ordering"."orders" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" SMALLINT NOT NULL DEFAULT 1,
    "payment_method" SMALLINT NOT NULL,
    "payment_status" SMALLINT NOT NULL,
    "subtotal_amount" BIGINT NOT NULL,
    "shipping_fee" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "affiliate_id" UUID,
    "link_id" UUID,
    "channel_code" TEXT,
    "referral_code_used" TEXT,
    "attribution_source" SMALLINT,
    "is_self_purchase" BOOLEAN NOT NULL DEFAULT false,
    "ship_name" TEXT NOT NULL,
    "ship_phone" TEXT NOT NULL,
    "ship_province" TEXT NOT NULL,
    "ship_ward" TEXT NOT NULL,
    "ship_address_line" TEXT NOT NULL,
    "customer_note" TEXT,
    "placed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "returned_at" TIMESTAMPTZ(6),
    "received_by" SMALLINT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordering"."order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordering"."order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" SMALLINT,
    "to_status" SMALLINT NOT NULL,
    "actor_type" SMALLINT NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordering"."care_notes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "contact_channel" SMALLINT,
    "contacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordering"."settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordering"."outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "ordering"."orders"("code");

-- CreateIndex
CREATE INDEX "orders_customer_id_placed_at_idx" ON "ordering"."orders"("customer_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_affiliate_id_placed_at_idx" ON "ordering"."orders"("affiliate_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_status_placed_at_idx" ON "ordering"."orders"("status", "placed_at");

-- CreateIndex
CREATE INDEX "orders_placed_at_idx" ON "ordering"."orders"("placed_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "ordering"."order_items"("order_id", "product_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "ordering"."order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "care_notes_order_id_contacted_at_idx" ON "ordering"."care_notes"("order_id", "contacted_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "ordering"."settings"("key");

-- AddForeignKey
ALTER TABLE "ordering"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordering"."order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordering"."care_notes" ADD CONSTRAINT "care_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK và partial index)
-- ═══════════════════════════════════════════════════════════════
-- Enum lưu SMALLINT; mã số lấy từ shared-library (contracts/codes.ts), xem chú thích đầu schema.prisma.
ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "orders_status_chk" CHECK ("status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "orders_payment_method_chk" CHECK ("payment_method" IN (1, 2)),
  ADD CONSTRAINT "orders_payment_status_chk" CHECK ("payment_status" IN (1, 2, 3, 4)),
  ADD CONSTRAINT "orders_attribution_source_chk" CHECK ("attribution_source" IS NULL OR "attribution_source" IN (1, 2)),
  ADD CONSTRAINT "orders_received_by_chk" CHECK ("received_by" IS NULL OR "received_by" IN (1, 2)),
  ADD CONSTRAINT "orders_amounts_chk"
    CHECK ("subtotal_amount" >= 0 AND "shipping_fee" >= 0 AND "total_amount" = "subtotal_amount" + "shipping_fee"),
  -- Có CTV thì phải có nguồn ghi nhận và ngược lại (đơn khách vãng lai: cả hai NULL).
  ADD CONSTRAINT "orders_attribution_chk"
    CHECK (("attribution_source" IS NULL) = ("affiliate_id" IS NULL)),
  ADD CONSTRAINT "orders_self_purchase_chk"
    CHECK (NOT "is_self_purchase" OR "affiliate_id" IS NOT NULL),
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
  ADD CONSTRAINT "orders_returned_chk" CHECK ("status" <> 7 OR "returned_at" IS NOT NULL),
  ADD CONSTRAINT "orders_ship_phone_chk" CHECK ("ship_phone" ~ '^\+84[0-9]{9}$');

ALTER TABLE "ordering"."order_items"
  ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_price_chk" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "order_items_line_total_chk" CHECK ("line_total" = "unit_price" * "quantity");

ALTER TABLE "ordering"."order_status_history"
  ADD CONSTRAINT "order_status_history_from_chk" CHECK ("from_status" IS NULL OR "from_status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "order_status_history_to_chk" CHECK ("to_status" IN (1, 2, 3, 4, 5, 6, 7)),
  ADD CONSTRAINT "order_status_history_actor_chk" CHECK ("actor_type" IN (1, 2, 3));

ALTER TABLE "ordering"."care_notes"
  ADD CONSTRAINT "care_notes_channel_chk" CHECK ("contact_channel" IS NULL OR "contact_channel" IN (1, 2, 3));

-- Hàng chờ CSKH: đơn DELIVERED (4) chưa COMPLETED, lâu nhất trước.
CREATE INDEX "orders_cskh_queue_idx"
  ON "ordering"."orders" ("delivered_at") WHERE "status" = 4;

-- Relay chỉ quét các sự kiện chưa gửi.
CREATE INDEX "outbox_events_pending_idx"
  ON "ordering"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
