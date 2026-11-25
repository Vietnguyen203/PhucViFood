// Seed customer_db: 5 khách, ngưỡng phân loại khách, 1 dòng nhật ký xuất. Chỉ dùng dev/demo.
import { ADMIN_ID, CUSTOMERS, CUSTOMER_SETTINGS } from '@phucvi/shared-library/seed-data';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.exportLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.setting.deleteMany();

  await prisma.customer.createMany({
    data: CUSTOMERS.map((c) => ({
      id: c.id, phone: c.phone, fullName: c.fullName, email: c.email, province: c.province, ward: c.ward,
      addressLine: c.addressLine, firstAffiliateId: c.firstAffiliateId, firstChannelCode: c.firstChannelCode,
      marketingConsent: c.consent, consentAt: c.consentAt,
    })),
  });
  await prisma.setting.createMany({ data: CUSTOMER_SETTINGS });
  await prisma.exportLog.create({
    data: { exportedBy: ADMIN_ID, filters: { segment: 'VIP' }, rowCount: 1, format: 'xlsx' },
  });

  console.log(`customer: ${CUSTOMERS.length} khách, ${CUSTOMER_SETTINGS.length} cấu hình`);
}

main().finally(() => prisma.$disconnect());
