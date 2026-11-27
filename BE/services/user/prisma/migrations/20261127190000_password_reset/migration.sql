-- Token đặt lại mật khẩu qua email: dùng một lần, có hạn, chỉ lưu băm.
CREATE TABLE "user"."password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "user"."password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_created_at_idx" ON "user"."password_reset_tokens"("user_id", "created_at");
ALTER TABLE "user"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_hash_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
