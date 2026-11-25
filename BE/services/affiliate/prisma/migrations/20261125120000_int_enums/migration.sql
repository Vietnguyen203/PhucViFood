-- Chuyển enum Postgres sang SMALLINT. Mã số lấy từ shared-library (contracts/codes.ts):
--   affiliates.status:        1 PENDING, 2 ACTIVE, 3 SUSPENDED, 4 REJECTED
--   tracking_events.type:     1 PRODUCT_VIEW, 2 ADD_TO_CART, 3 CHECKOUT_START
--   commissions.status:       1 ESTIMATED, 2 CONFIRMED, 3 PAID, 4 CANCELLED
--   commissions.confirmed_by: 1 CUSTOMER, 2 ADMIN
-- USING CASE giữ nguyên dữ liệu đang có; giá trị lạ cho NULL nên vi phạm NOT NULL và migration dừng lại.

-- Các CHECK đang so sánh với chữ ('PAID'...) phải gỡ trước, tạo lại bằng số ở cuối.
ALTER TABLE "commission"."commissions"
  DROP CONSTRAINT "commissions_paid_chk",
  DROP CONSTRAINT "commissions_payout_only_when_paid_chk",
  DROP CONSTRAINT "commissions_confirmed_chk",
  DROP CONSTRAINT "commissions_cancelled_chk";

ALTER TABLE "affiliate"."affiliates" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "commission"."commissions" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "affiliate"."affiliates"
  ALTER COLUMN "status" TYPE SMALLINT
    USING (CASE "status"::text WHEN 'PENDING' THEN 1 WHEN 'ACTIVE' THEN 2 WHEN 'SUSPENDED' THEN 3 WHEN 'REJECTED' THEN 4 END);

ALTER TABLE "tracking"."tracking_events"
  ALTER COLUMN "type" TYPE SMALLINT
    USING (CASE "type"::text WHEN 'PRODUCT_VIEW' THEN 1 WHEN 'ADD_TO_CART' THEN 2 WHEN 'CHECKOUT_START' THEN 3 END);

ALTER TABLE "commission"."commissions"
  ALTER COLUMN "status" TYPE SMALLINT
    USING (CASE "status"::text WHEN 'ESTIMATED' THEN 1 WHEN 'CONFIRMED' THEN 2 WHEN 'PAID' THEN 3 WHEN 'CANCELLED' THEN 4 END),
  ALTER COLUMN "confirmed_by" TYPE SMALLINT
    USING (CASE "confirmed_by"::text WHEN 'CUSTOMER' THEN 1 WHEN 'ADMIN' THEN 2 END);

ALTER TABLE "affiliate"."affiliates" ALTER COLUMN "status" SET DEFAULT 1;
ALTER TABLE "commission"."commissions" ALTER COLUMN "status" SET DEFAULT 1;

DROP TYPE "affiliate"."AffiliateStatus";
DROP TYPE "tracking"."TrackingEventType";
DROP TYPE "commission"."CommissionStatus";
DROP TYPE "commission"."ConfirmSource";

-- Không còn enum của Postgres bảo vệ, nên giới hạn giá trị bằng CHECK.
ALTER TABLE "affiliate"."affiliates"
  ADD CONSTRAINT "affiliates_status_chk" CHECK ("status" IN (1, 2, 3, 4));
ALTER TABLE "tracking"."tracking_events"
  ADD CONSTRAINT "tracking_events_type_chk" CHECK ("type" IN (1, 2, 3));

ALTER TABLE "commission"."commissions"
  ADD CONSTRAINT "commissions_status_chk" CHECK ("status" IN (1, 2, 3, 4)),
  ADD CONSTRAINT "commissions_confirmed_by_chk" CHECK ("confirmed_by" IS NULL OR "confirmed_by" IN (1, 2)),
  -- Vòng đời: PAID (3) phải có đợt chi trả và ngày trả; chỉ PAID mới có payout_id.
  ADD CONSTRAINT "commissions_paid_chk"
    CHECK ("status" <> 3 OR ("payout_id" IS NOT NULL AND "paid_at" IS NOT NULL)),
  ADD CONSTRAINT "commissions_payout_only_when_paid_chk"
    CHECK ("payout_id" IS NULL OR "status" = 3),
  -- CONFIRMED (2) và PAID (3) phải có mốc xác nhận; CANCELLED (4) phải có mốc hủy.
  ADD CONSTRAINT "commissions_confirmed_chk"
    CHECK ("status" NOT IN (2, 3) OR "confirmed_at" IS NOT NULL),
  ADD CONSTRAINT "commissions_cancelled_chk"
    CHECK ("status" <> 4 OR "cancelled_at" IS NOT NULL);
