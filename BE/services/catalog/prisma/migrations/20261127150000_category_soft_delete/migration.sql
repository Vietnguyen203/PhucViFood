-- Xóa mềm danh mục: sản phẩm đã xóa mềm vẫn tham chiếu danh mục (khóa ngoại), nên không xóa hẳn dòng được.
ALTER TABLE "catalog"."categories" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
