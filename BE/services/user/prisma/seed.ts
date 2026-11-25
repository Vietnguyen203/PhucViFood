// Seed user_db: 1 admin + 2 tài khoản CTV. Chỉ dùng dev/demo.
import { hashSync } from 'bcryptjs';
import { UserRoleCodec } from '@phucvi/shared-library/contracts';
import { USERS } from '@phucvi/shared-library/seed-data';
import { PrismaClient } from '../generated/client';

// Mật khẩu mẫu chỉ cho môi trường dev local. Đổi ngay nếu dùng ở nơi khác.
const DEV_PASSWORD = 'Dev@123456';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = hashSync(DEV_PASSWORD, 10);
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: USERS.map((u) => ({ id: u.id, email: u.email, role: UserRoleCodec.toCode(u.role), passwordHash })),
  });
  console.log(`user: đã seed ${USERS.length} tài khoản`);
}

main().finally(() => prisma.$disconnect());
