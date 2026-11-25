-- Chuyển enum Postgres sang SMALLINT. Mã số lấy từ shared-library (contracts/codes.ts):
--   role:   1 ADMIN, 2 AFFILIATE
--   status: 1 ACTIVE, 2 DISABLED
-- USING CASE giữ nguyên dữ liệu đang có; giá trị lạ cho NULL nên vi phạm NOT NULL và migration dừng lại.

ALTER TABLE "user"."users" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "user"."users"
  ALTER COLUMN "role" TYPE SMALLINT
    USING (CASE "role"::text WHEN 'ADMIN' THEN 1 WHEN 'AFFILIATE' THEN 2 END),
  ALTER COLUMN "status" TYPE SMALLINT
    USING (CASE "status"::text WHEN 'ACTIVE' THEN 1 WHEN 'DISABLED' THEN 2 END);

ALTER TABLE "user"."users" ALTER COLUMN "status" SET DEFAULT 1;

DROP TYPE "user"."UserRole";
DROP TYPE "user"."UserStatus";

-- Không còn enum của Postgres bảo vệ, nên giới hạn giá trị bằng CHECK.
ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_role_chk" CHECK ("role" IN (1, 2)),
  ADD CONSTRAINT "users_status_chk" CHECK ("status" IN (1, 2));
