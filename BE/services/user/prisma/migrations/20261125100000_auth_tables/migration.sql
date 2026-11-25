-- AlterTable
ALTER TABLE "user"."users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "user"."refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "user"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "user"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "user"."refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "user"."refresh_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "user"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- SQL tay (Prisma không mô tả được CHECK)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "user"."users"
  ADD CONSTRAINT "users_failed_login_attempts_chk" CHECK ("failed_login_attempts" >= 0);

-- token_hash là SHA-256 dạng hex (64 ký tự); hạn dùng phải sau thời điểm tạo.
ALTER TABLE "user"."refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_hash_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "refresh_tokens_expiry_chk" CHECK ("expires_at" > "created_at");
