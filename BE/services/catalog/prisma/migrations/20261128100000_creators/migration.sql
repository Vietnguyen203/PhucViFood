-- KOL/KOC trang chủ (kind 1 KOL, 2 KOC).
CREATE TABLE "catalog"."creators" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" SMALLINT NOT NULL,
    "headline" TEXT,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "creators_is_active_sort_order_idx" ON "catalog"."creators"("is_active", "sort_order");
ALTER TABLE "catalog"."creators" ADD CONSTRAINT "creators_kind_chk" CHECK ("kind" IN (1, 2));
