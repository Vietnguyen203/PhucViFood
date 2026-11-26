#!/bin/sh
# Khởi động một service trong container.
#   RUN_MIGRATIONS=true  (mặc định) : áp migration (nếu service có database) trước khi chạy service.
#   RUN_MIGRATIONS=false            : bỏ qua migration (dùng khi đã chạy `pnpm stack:migrate` một lần trước, nhiều bản sao service).
#   MIGRATE_ONLY=true               : chỉ áp migration rồi thoát (dùng làm job riêng, xem migrate-stack.mjs).
# Prisma tự khóa (advisory lock) khi áp migration, nên nhiều bản sao cùng chạy migrate không giẫm chân nhau.
set -e
cd "/app/BE/services/${SERVICE:?thiếu biến SERVICE}"

if [ "${RUN_MIGRATIONS:-true}" != "false" ] || [ "${MIGRATE_ONLY:-false}" = "true" ]; then
  if [ -f prisma/schema.prisma ]; then
    echo "[entrypoint] ${SERVICE}: áp dụng migration"
    node node_modules/prisma/build/index.js migrate deploy
  else
    echo "[entrypoint] ${SERVICE}: không có database, bỏ qua migration"
  fi
fi

if [ "${MIGRATE_ONLY:-false}" = "true" ]; then
  echo "[entrypoint] ${SERVICE}: chỉ áp migration, thoát"
  exit 0
fi

echo "[entrypoint] ${SERVICE}: khởi động"
exec node node_modules/tsx/dist/cli.mjs src/main.ts
