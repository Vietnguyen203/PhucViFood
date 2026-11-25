-- AlterTable
ALTER TABLE "ordering"."orders" ADD COLUMN     "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "ordering"."orders"("idempotency_key");

-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "ordering"."orders"
  ADD CONSTRAINT "orders_idempotency_key_chk" CHECK ("idempotency_key" IS NULL OR char_length("idempotency_key") BETWEEN 8 AND 100);
