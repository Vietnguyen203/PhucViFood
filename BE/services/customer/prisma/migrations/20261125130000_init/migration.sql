-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "customer";

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


-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK và partial index)
-- ═══════════════════════════════════════════════════════════════
-- customer.customers
ALTER TABLE "customer"."customers"
  ADD CONSTRAINT "customers_phone_chk" CHECK ("phone" ~ '^\+84[0-9]{9}$'),
  ADD CONSTRAINT "customers_consent_chk" CHECK (NOT "marketing_consent" OR "consent_at" IS NOT NULL);

-- Relay chỉ quét các sự kiện chưa gửi.
CREATE INDEX "outbox_events_pending_idx"
  ON "customer"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
