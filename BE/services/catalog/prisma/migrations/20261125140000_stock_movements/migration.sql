-- CreateTable
CREATE TABLE "catalog"."stock_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" SMALLINT NOT NULL,
    "order_id" UUID,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "catalog"."stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "catalog"."stock_movements"("order_id");

-- AddForeignKey
ALTER TABLE "catalog"."stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK và partial unique index)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "catalog"."stock_movements"
  ADD CONSTRAINT "stock_movements_delta_chk" CHECK ("delta" <> 0),
  ADD CONSTRAINT "stock_movements_reason_chk" CHECK ("reason" IN (1, 2, 3)),
  -- Lý do gắn với đơn (giữ hàng, trả hàng) phải có order_id; điều chỉnh tay thì không.
  ADD CONSTRAINT "stock_movements_order_chk" CHECK (("reason" IN (1, 2)) = ("order_id" IS NOT NULL)),
  -- Giữ hàng cho đơn: delta âm. Trả hàng khi hủy đơn: delta dương.
  ADD CONSTRAINT "stock_movements_sign_chk" CHECK (("reason" <> 1 OR "delta" < 0) AND ("reason" <> 2 OR "delta" > 0));

-- Mỗi đơn chỉ giữ hàng một lần và trả hàng một lần cho mỗi sản phẩm (idempotent kể cả khi gọi song song).
CREATE UNIQUE INDEX "stock_movements_order_product_reason_key"
  ON "catalog"."stock_movements" ("order_id", "product_id", "reason") WHERE "order_id" IS NOT NULL;
