-- Video YouTube trang chủ.
CREATE TABLE "catalog"."videos" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "videos_is_active_sort_order_idx" ON "catalog"."videos"("is_active", "sort_order");
