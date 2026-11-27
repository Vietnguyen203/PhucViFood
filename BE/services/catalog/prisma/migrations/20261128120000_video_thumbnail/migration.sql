-- Ảnh bìa tùy chọn cho video (video không phải YouTube không tự có ảnh bìa).
ALTER TABLE "catalog"."videos" ADD COLUMN "thumbnail_url" TEXT;
