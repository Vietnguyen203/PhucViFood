-- Banner trang chủ (slot 1 MAIN, 2 SIDE).
CREATE TABLE "catalog"."banners" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "slot" SMALLINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "banners_slot_is_active_sort_order_idx" ON "catalog"."banners"("slot", "is_active", "sort_order");
ALTER TABLE "catalog"."banners" ADD CONSTRAINT "banners_slot_chk" CHECK ("slot" IN (1, 2));
ALTER TABLE "catalog"."banners" ADD CONSTRAINT "banners_schedule_chk" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
