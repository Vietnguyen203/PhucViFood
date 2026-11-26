// Nạp dữ liệu mẫu cho các service đang chạy trong Docker (chạy `pnpm stack:seed`).
// CẢNH BÁO: seed XÓA rồi nạp lại dữ liệu của từng service (giống `pnpm db:seed`), kể cả dữ liệu bạn đã tự tạo.
import { spawnSync } from 'node:child_process';

const SERVICES = ['user', 'catalog', 'affiliate', 'customer', 'ordering', 'tracking'];
const compose = ['compose', '--env-file', '.env', '-f', 'BE/infra/docker-compose.yml', '--profile', 'app'];

let failed = false;
for (const service of SERVICES) {
  console.log(`\n== seed ${service}`);
  const r = spawnSync(
    'docker',
    [...compose, 'exec', '-T', '-w', `/app/BE/services/${service}`, service, 'node', 'node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) { failed = true; console.error(`Seed ${service} lỗi (mã ${r.status}). Service đã chạy chưa? Dùng "pnpm stack:up" trước.`); }
}
process.exit(failed ? 1 : 0);
