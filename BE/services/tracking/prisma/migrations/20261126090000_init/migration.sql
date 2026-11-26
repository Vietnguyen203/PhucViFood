-- Tách tracking khỏi service affiliate: database riêng tracking_db, không khóa ngoại sang service khác.
-- Mã số enum (lưu SMALLINT, khớp shared-library contracts/codes.ts):
--   tracking_events.type: 1 PRODUCT_VIEW, 2 ADD_TO_CART, 3 CHECKOUT_START

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tracking";

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
    "type" SMALLINT NOT NULL,
    "product_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_clicks_affiliate_id_created_at_idx" ON "tracking"."referral_clicks"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "referral_clicks_visitor_id_idx" ON "tracking"."referral_clicks"("visitor_id");

-- CreateIndex
CREATE INDEX "tracking_events_affiliate_id_type_created_at_idx" ON "tracking"."tracking_events"("affiliate_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "tracking_events_visitor_id_idx" ON "tracking"."tracking_events"("visitor_id");


-- Ràng buộc mã số enum
ALTER TABLE "tracking"."tracking_events"
  ADD CONSTRAINT "tracking_events_type_chk" CHECK ("type" IN (1, 2, 3));
