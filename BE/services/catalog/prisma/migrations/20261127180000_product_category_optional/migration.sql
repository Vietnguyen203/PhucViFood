-- Sản phẩm không bắt buộc có danh mục.
ALTER TABLE "catalog"."products" ALTER COLUMN "category_id" DROP NOT NULL;
