// Áp migration cho mọi service có database, như một bước riêng TRƯỚC khi bật service (chạy `pnpm stack:migrate`).
// Dùng khi chạy nhiều bản sao mỗi service hoặc muốn tách rủi ro migration khỏi việc khởi động:
//   pnpm stack:migrate                    # áp migration (cần Postgres đang chạy: pnpm db:up)
//   $env:RUN_MIGRATIONS="false"; pnpm stack:up   # bật service, không tự áp migration nữa
// Mỗi service chạy trong container một lần (docker compose run --rm), dùng đúng image và cấu hình của service đó.
import { spawnSync } from 'node:child_process';

const SERVICES = ['user', 'catalog', 'affiliate', 'customer', 'ordering', 'tracking']; // gateway không có database
const compose = ['compose', '--env-file', '.env', '-f', 'BE/infra/docker-compose.yml', '--profile', 'app'];

let failed = false;
for (const service of SERVICES) {
  console.log(`\n== migrate ${service}`);
  const r = spawnSync('docker', [...compose, 'run', '--rm', '--no-deps', '-e', 'MIGRATE_ONLY=true', service], { stdio: 'inherit' });
  if (r.status !== 0) { failed = true; console.error(`Migration của ${service} lỗi (mã ${r.status}).`); }
}
process.exit(failed ? 1 : 0);
