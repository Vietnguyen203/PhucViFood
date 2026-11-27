-- Vai trò CUSTOMER (3): khách mua hàng có tài khoản. Thêm họ tên hiển thị.
ALTER TABLE "user"."users" ADD COLUMN "full_name" TEXT;

ALTER TABLE "user"."users" DROP CONSTRAINT "users_role_chk";
ALTER TABLE "user"."users" ADD CONSTRAINT "users_role_chk" CHECK ("role" IN (1, 2, 3));
