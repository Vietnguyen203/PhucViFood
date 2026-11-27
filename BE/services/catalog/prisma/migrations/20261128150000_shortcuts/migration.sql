-- Ô tròn lối tắt trang chủ.
CREATE TABLE "catalog"."shortcuts" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "shortcuts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shortcuts_is_active_sort_order_idx" ON "catalog"."shortcuts"("is_active", "sort_order");
