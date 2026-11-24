// Seed identity_db: 1 admin + 2 tài khoản CTV. Chỉ dùng dev/demo.
import { hashSync } from 'bcryptjs';
import { USERS } from '@phucvi/shared-library';
import { PrismaClient } from '../generated/client';

// Mật khẩu mẫu chỉ cho môi trường dev local. Đổi ngay nếu dùng ở nơi khác.
const DEV_PASSWORD = 'Dev@123456';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = hashSync(DEV_PASSWORD, 10);
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: USERS.map((u) => ({ id: u.id, email: u.email, role: u.role, passwordHash })),
  });
  console.log(`identity: đã seed ${USERS.length} tài khoản`);
}

main().finally(() => prisma.$disconnect());
