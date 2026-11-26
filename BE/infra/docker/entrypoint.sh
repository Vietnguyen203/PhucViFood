#!/bin/sh
# Khởi động một service trong container: áp migration (nếu service có database) rồi chạy service.
set -e
cd "/app/BE/services/${SERVICE:?thiếu biến SERVICE}"

if [ -f prisma/schema.prisma ]; then
  echo "[entrypoint] ${SERVICE}: áp dụng migration"
  node node_modules/prisma/build/index.js migrate deploy
fi

echo "[entrypoint] ${SERVICE}: khởi động"
exec node node_modules/tsx/dist/cli.mjs src/main.ts
