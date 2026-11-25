-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "customer";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ordering";

-- CreateEnum
CREATE TYPE "ordering"."OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ordering"."PaymentMethod" AS ENUM ('COD', 'BANK_QR');

-- CreateEnum
CREATE TYPE "ordering"."PaymentStatus" AS ENUM ('PENDING', 'UNPAID', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ordering"."AttributionSource" AS ENUM ('LINK', 'CODE');

-- CreateEnum
CREATE TYPE "ordering"."ReceivedBy" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ordering"."ActorType" AS ENUM ('SYSTEM', 'CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ordering"."ContactChannel" AS ENUM ('CALL', 'ZALO', 'SMS');

-- CreateTable
CREATE TABLE "catalog"."categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "price" BIGINT NOT NULL,
    "original_price" BIGINT,
    "image_url" TEXT,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."inbox_events" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."outbox_events" (
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

-- CreateTable
CREATE TABLE "ordering"."orders" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "ordering"."OrderStatus" NOT NULL DEFAULT 'PLACED',
    "payment_method" "ordering"."PaymentMethod" NOT NULL,
    "payment_status" "ordering"."PaymentStatus" NOT NULL,
    "subtotal_amount" BIGINT NOT NULL,
    "shipping_fee" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "affiliate_id" UUID,
    "link_id" UUID,
    "channel_code" TEXT,
    "referral_code_used" TEXT,
    "attribution_source" "ordering"."AttributionSource",
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
    "received_by" "ordering"."ReceivedBy",
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
    "from_status" "ordering"."OrderStatus",
    "to_status" "ordering"."OrderStatus" NOT NULL,
    "actor_type" "ordering"."ActorType" NOT NULL,
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
    "contact_channel" "ordering"."ContactChannel",
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

-- CreateTable
CREATE TABLE "customer"."customers" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "province" TEXT,
    "ward" TEXT,
    "address_line" TEXT,
    "first_affiliate_id" UUID,
    "first_channel_code" TEXT,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(6),
    "consent_withdrawn_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."export_logs" (
    "id" UUID NOT NULL,
    "exported_by" UUID NOT NULL,
    "filters" JSONB,
    "row_count" INTEGER NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."inbox_events" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer"."outbox_events" (
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
CREATE UNIQUE INDEX "categories_slug_key" ON "catalog"."categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "catalog"."products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "catalog"."products"("sku");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "catalog"."products"("category_id");

-- CreateIndex
CREATE INDEX "products_is_visible_deleted_at_idx" ON "catalog"."products"("is_visible", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_message_id_consumer_key" ON "catalog"."inbox_events"("message_id", "consumer");

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

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customer"."customers"("phone");

-- CreateIndex
CREATE INDEX "customers_province_idx" ON "customer"."customers"("province");

-- CreateIndex
CREATE INDEX "customers_first_affiliate_id_idx" ON "customer"."customers"("first_affiliate_id");

-- CreateIndex
CREATE INDEX "export_logs_created_at_idx" ON "customer"."export_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "customer"."settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_message_id_consumer_key" ON "customer"."inbox_events"("message_id", "consumer");

-- AddForeignKey
ALTER TABLE "catalog"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordering"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordering"."order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordering"."care_notes" ADD CONSTRAINT "care_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "ordering"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK và partial index)
-- ═══════════════════════════════════════════════════════════════

-- catalog.products
ALTER TABLE "catalog"."products"
  ADD CONSTRAINT "products_price_chk" CHECK ("price" >= 0),
  ADD CONSTRAINT "products_original_price_chk" CHECK ("original_price" IS NULL OR "original_price" >= "price"),
  ADD CONSTRAINT "products_stock_chk" CHECK ("stock_quantity" >= 0);

-- ordering.orders
ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "orders_amounts_chk"
    CHECK ("subtotal_amount" >= 0 AND "shipping_fee" >= 0 AND "total_amount" = "subtotal_amount" + "shipping_fee"),
  -- Có CTV thì phải có nguồn ghi nhận và ngược lại (đơn khách vãng lai: cả hai NULL).
  ADD CONSTRAINT "orders_attribution_chk"
    CHECK (("attribution_source" IS NULL) = ("affiliate_id" IS NULL)),
  ADD CONSTRAINT "orders_self_purchase_chk"
    CHECK (NOT "is_self_purchase" OR "affiliate_id" IS NOT NULL),
  -- COD: PENDING/PAID/REFUNDED. Chuyển khoản QR: UNPAID/PAID/REFUNDED.
  ADD CONSTRAINT "orders_payment_chk" CHECK (
    ("payment_method" = 'COD' AND "payment_status" IN ('PENDING', 'PAID', 'REFUNDED'))
    OR ("payment_method" = 'BANK_QR' AND "payment_status" IN ('UNPAID', 'PAID', 'REFUNDED'))
  ),
  ADD CONSTRAINT "orders_delivered_at_chk"
    CHECK ("status" NOT IN ('DELIVERED', 'COMPLETED') OR "delivered_at" IS NOT NULL),
  ADD CONSTRAINT "orders_completed_chk"
    CHECK ("status" <> 'COMPLETED' OR ("completed_at" IS NOT NULL AND "received_by" IS NOT NULL)),
  ADD CONSTRAINT "orders_cancelled_chk"
    CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL),
  ADD CONSTRAINT "orders_returned_chk"
    CHECK ("status" <> 'RETURNED' OR "returned_at" IS NOT NULL),
  ADD CONSTRAINT "orders_ship_phone_chk" CHECK ("ship_phone" ~ '^\+84[0-9]{9}$');

-- Hàng chờ CSKH: đơn DELIVERED chưa COMPLETED, lâu nhất trước.
CREATE INDEX "orders_cskh_queue_idx"
  ON "ordering"."orders" ("delivered_at") WHERE "status" = 'DELIVERED';

-- ordering.order_items
ALTER TABLE "ordering"."order_items"
  ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_price_chk" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "order_items_line_total_chk" CHECK ("line_total" = "unit_price" * "quantity");

-- customer.customers
ALTER TABLE "customer"."customers"
  ADD CONSTRAINT "customers_phone_chk" CHECK ("phone" ~ '^\+84[0-9]{9}$'),
  ADD CONSTRAINT "customers_consent_chk" CHECK (NOT "marketing_consent" OR "consent_at" IS NOT NULL);

CREATE INDEX "catalog_outbox_events_pending_idx"
  ON "catalog"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
CREATE INDEX "ordering_outbox_events_pending_idx"
  ON "ordering"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
CREATE INDEX "customer_outbox_events_pending_idx"
  ON "customer"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
