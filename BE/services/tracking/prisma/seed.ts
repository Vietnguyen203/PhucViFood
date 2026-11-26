// Seed tracking_db: lượt bấm và tương tác mẫu (chỉ để thống kê). Chỉ dùng dev/demo.
import { CLICKS, TRACKING_EVENTS } from '@phucvi/shared-library/seed-data';
import { TrackingEventTypeCodec } from '@phucvi/shared-library/contracts';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.trackingEvent.deleteMany();
  await prisma.referralClick.deleteMany();

  await prisma.referralClick.createMany({ data: CLICKS });
  await prisma.trackingEvent.createMany({
    data: TRACKING_EVENTS.map((e) => ({ ...e, type: TrackingEventTypeCodec.toCode(e.type) })),
  });

  console.log(`tracking: ${CLICKS.length} lượt bấm, ${TRACKING_EVENTS.length} sự kiện`);
}

main().finally(() => prisma.$disconnect());
