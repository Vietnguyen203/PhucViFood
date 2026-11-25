// Seed affiliate_db: 2 CTV, link theo kênh, tương tác, hoa hồng ở đủ trạng thái, 1 đợt chi trả.
import {
  AFFILIATES, AFFILIATE_SETTINGS, CLICKS, COMMISSIONS, LINKS, PAYOUTS, TRACKING_EVENTS, ADMIN_ID,
} from '@phucvi/shared-library/seed-data';
import {
  AffiliateStatusCodec, CommissionStatusCodec, ConfirmSourceCodec, TrackingEventTypeCodec,
} from '@phucvi/shared-library/contracts';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00Z`); // cột DATE

async function main() {
  // Xóa theo thứ tự phụ thuộc để chạy lại được nhiều lần.
  await prisma.commission.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.trackingEvent.deleteMany();
  await prisma.referralClick.deleteMany();
  await prisma.affiliateLink.deleteMany();
  await prisma.affiliate.deleteMany();
  await prisma.affiliateSetting.deleteMany();

  await prisma.affiliate.createMany({
    data: AFFILIATES.map((a) => ({
      id: a.id, userId: a.userId, fullName: a.fullName, phone: a.phone, referralCode: a.referralCode,
      status: AffiliateStatusCodec.toCode(a.status), contractStart: d(a.contractStart), contractEnd: d(a.contractEnd),
      commissionRateBps: a.commissionRateBps, bankName: a.bankName, bankAccountNo: a.bankAccountNo,
      bankAccountHolder: a.bankAccountHolder, approvedAt: new Date('2026-01-01T00:00:00+07:00'),
    })),
  });
  await prisma.affiliateLink.createMany({ data: LINKS });
  await prisma.affiliateSetting.createMany({ data: AFFILIATE_SETTINGS });
  await prisma.referralClick.createMany({ data: CLICKS });
  await prisma.trackingEvent.createMany({
    data: TRACKING_EVENTS.map((e) => ({ ...e, type: TrackingEventTypeCodec.toCode(e.type) })),
  });

  await prisma.payout.createMany({
    data: PAYOUTS.map((p) => ({ ...p, totalAmount: BigInt(p.totalAmount), createdBy: ADMIN_ID })),
  });
  await prisma.commission.createMany({
    data: COMMISSIONS.map((c) => ({
      ...c, baseAmount: BigInt(c.baseAmount), amount: BigInt(c.amount),
      status: CommissionStatusCodec.toCode(c.status), confirmedBy: ConfirmSourceCodec.toCodeOrNull(c.confirmedBy),
    })),
  });

  console.log(
    `affiliate: ${AFFILIATES.length} CTV, ${LINKS.length} link, ${CLICKS.length} click, ` +
      `${TRACKING_EVENTS.length} sự kiện, ${COMMISSIONS.length} hoa hồng, ${PAYOUTS.length} đợt chi trả`,
  );
}

main().finally(() => prisma.$disconnect());
