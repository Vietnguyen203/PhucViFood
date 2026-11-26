-- Khoản trừ vào hoa hồng của CTV khi đơn bị hoàn SAU KHI hoa hồng đã chi trả.
-- Mã số enum (SMALLINT, khớp shared-library contracts/codes.ts):
--   adjustments.status: 1 PENDING (chờ trừ vào đợt chi sau), 2 APPLIED (đã trừ), 3 WAIVED (admin miễn trừ)
-- payouts.total_amount là số tiền thực chuyển (đã trừ adjustment_amount); các đợt cũ có adjustment_amount = 0.

-- AlterTable
ALTER TABLE "commission"."payouts" ADD COLUMN     "adjustment_amount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "commission"."adjustments" (
    "id" UUID NOT NULL,
    "commission_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_code" TEXT NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" SMALLINT NOT NULL DEFAULT 1,
    "applied_payout_id" UUID,
    "applied_at" TIMESTAMPTZ(6),
    "waived_at" TIMESTAMPTZ(6),
    "waived_by" UUID,
    "waive_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adjustments_commission_id_key" ON "commission"."adjustments"("commission_id");

-- CreateIndex
CREATE INDEX "adjustments_affiliate_id_status_created_at_idx" ON "commission"."adjustments"("affiliate_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "adjustments_applied_payout_id_idx" ON "commission"."adjustments"("applied_payout_id");

-- AddForeignKey
ALTER TABLE "commission"."adjustments" ADD CONSTRAINT "adjustments_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "commission"."commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission"."adjustments" ADD CONSTRAINT "adjustments_applied_payout_id_fkey" FOREIGN KEY ("applied_payout_id") REFERENCES "commission"."payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ràng buộc: mã số enum, số tiền, và trạng thái khớp với dữ liệu đi kèm
ALTER TABLE "commission"."adjustments"
  ADD CONSTRAINT "adjustments_status_chk" CHECK ("status" IN (1, 2, 3)),
  ADD CONSTRAINT "adjustments_amount_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "adjustments_applied_chk" CHECK (("status" = 2) = ("applied_payout_id" IS NOT NULL AND "applied_at" IS NOT NULL)),
  ADD CONSTRAINT "adjustments_waived_chk" CHECK (("status" = 3) = ("waived_at" IS NOT NULL AND "waived_by" IS NOT NULL));

ALTER TABLE "commission"."payouts"
  ADD CONSTRAINT "payouts_adjustment_amount_chk" CHECK ("adjustment_amount" >= 0);

-- Đợt chi mà các khoản trừ bù đúng hết hoa hồng thì thực chuyển 0 đồng (vẫn tất toán hoa hồng): cho phép total_amount = 0.
ALTER TABLE "commission"."payouts" DROP CONSTRAINT "payouts_total_chk";
ALTER TABLE "commission"."payouts" ADD CONSTRAINT "payouts_total_chk" CHECK ("total_amount" >= 0);
