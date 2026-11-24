-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "affiliate";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commission";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tracking";

-- CreateEnum
CREATE TYPE "affiliate"."AffiliateStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "tracking"."TrackingEventType" AS ENUM ('PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_START');

-- CreateEnum
CREATE TYPE "commission"."CommissionStatus" AS ENUM ('ESTIMATED', 'CONFIRMED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "commission"."ConfirmSource" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateTable
CREATE TABLE "affiliate"."affiliates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "status" "affiliate"."AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "contract_start" DATE,
    "contract_end" DATE,
    "commission_rate_bps" INTEGER NOT NULL DEFAULT 1000,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "bank_account_holder" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."affiliate_links" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "channel_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "affiliate_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate"."outbox_events" (
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
CREATE TABLE "tracking"."referral_clicks" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "link_id" UUID,
    "channel_code" TEXT,
    "visitor_id" UUID NOT NULL,
    "landing_path" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking"."tracking_events" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "channel_code" TEXT,
    "type" "tracking"."TrackingEventType" NOT NULL,
    "product_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission"."commissions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_code" TEXT NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "link_id" UUID,
    "channel_code" TEXT,
    "rate_bps" INTEGER NOT NULL,
    "base_amount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "commission"."CommissionStatus" NOT NULL DEFAULT 'ESTIMATED',
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" "commission"."ConfirmSource",
    "paid_at" TIMESTAMPTZ(6),
    "payout_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission"."payouts" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "payment_reference" TEXT,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission"."inbox_events" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission"."outbox_events" (
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
CREATE UNIQUE INDEX "affiliates_user_id_key" ON "affiliate"."affiliates"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_phone_key" ON "affiliate"."affiliates"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_referral_code_key" ON "affiliate"."affiliates"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_links_affiliate_id_channel_code_key" ON "affiliate"."affiliate_links"("affiliate_id", "channel_code");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "affiliate"."settings"("key");

-- CreateIndex
CREATE INDEX "referral_clicks_affiliate_id_created_at_idx" ON "tracking"."referral_clicks"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "referral_clicks_visitor_id_idx" ON "tracking"."referral_clicks"("visitor_id");

-- CreateIndex
CREATE INDEX "tracking_events_affiliate_id_type_created_at_idx" ON "tracking"."tracking_events"("affiliate_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "tracking_events_visitor_id_idx" ON "tracking"."tracking_events"("visitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_order_id_key" ON "commission"."commissions"("order_id");

-- CreateIndex
CREATE INDEX "commissions_affiliate_id_status_idx" ON "commission"."commissions"("affiliate_id", "status");

-- CreateIndex
CREATE INDEX "commissions_payout_id_idx" ON "commission"."commissions"("payout_id");

-- CreateIndex
CREATE INDEX "payouts_affiliate_id_paid_at_idx" ON "commission"."payouts"("affiliate_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_message_id_consumer_key" ON "commission"."inbox_events"("message_id", "consumer");

-- AddForeignKey
ALTER TABLE "affiliate"."affiliate_links" ADD CONSTRAINT "affiliate_links_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliate"."affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission"."commissions" ADD CONSTRAINT "commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "commission"."payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK và partial index)
-- ═══════════════════════════════════════════════════════════════

-- affiliate.affiliates
ALTER TABLE "affiliate"."affiliates"
  ADD CONSTRAINT "affiliates_phone_chk" CHECK ("phone" ~ '^\+84[0-9]{9}$'),
  -- Mã giới thiệu lưu chữ thường; tra cứu không phân biệt hoa thường bằng cách lower() ở app.
  ADD CONSTRAINT "affiliates_referral_code_chk" CHECK ("referral_code" ~ '^[a-z0-9]{4,12}$'),
  ADD CONSTRAINT "affiliates_rate_chk" CHECK ("commission_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "affiliates_contract_range_chk"
    CHECK ("contract_start" IS NULL OR "contract_end" IS NULL OR "contract_end" >= "contract_start");

-- affiliate.affiliate_links
ALTER TABLE "affiliate"."affiliate_links"
  ADD CONSTRAINT "affiliate_links_channel_chk" CHECK ("channel_code" ~ '^[a-z0-9_-]{1,30}$');

CREATE INDEX "affiliate_outbox_events_pending_idx"
  ON "affiliate"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;

-- commission.commissions
ALTER TABLE "commission"."commissions"
  ADD CONSTRAINT "commissions_amounts_chk"
    CHECK ("base_amount" >= 0 AND "amount" >= 0 AND "rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "commissions_paid_chk"
    CHECK ("status" <> 'PAID' OR ("payout_id" IS NOT NULL AND "paid_at" IS NOT NULL)),
  ADD CONSTRAINT "commissions_payout_only_when_paid_chk"
    CHECK ("payout_id" IS NULL OR "status" = 'PAID'),
  ADD CONSTRAINT "commissions_confirmed_chk"
    CHECK ("status" NOT IN ('CONFIRMED', 'PAID') OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "commissions_cancelled_chk"
    CHECK ("status" <> 'CANCELLED' OR "cancelled_at" IS NOT NULL);

-- commission.payouts
ALTER TABLE "commission"."payouts"
  ADD CONSTRAINT "payouts_total_chk" CHECK ("total_amount" > 0);

CREATE INDEX "commission_outbox_events_pending_idx"
  ON "commission"."outbox_events" ("next_attempt_at") WHERE "published_at" IS NULL;
