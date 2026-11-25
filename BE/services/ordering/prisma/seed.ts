// Seed ordering_db: 12 đơn ở đủ trạng thái, lịch sử, ghi chú CSKH, cấu hình phí ship. Chỉ dùng dev/demo.
import {
  ActorTypeCodec, AttributionSourceCodec, ContactChannelCodec, OrderStatusCodec, PaymentMethodCodec,
  PaymentStatusCodec, ReceivedByCodec,
} from '@phucvi/shared-library/contracts';
import { ADMIN_ID, CARE_NOTES, ORDERING_SETTINGS, ORDERS } from '@phucvi/shared-library/seed-data';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  // Xóa theo thứ tự phụ thuộc để chạy lại được nhiều lần.
  await prisma.order.deleteMany(); // cascade: items, history, care notes
  await prisma.setting.deleteMany();
  await prisma.setting.createMany({ data: ORDERING_SETTINGS });

  for (const o of ORDERS) {
    await prisma.order.create({
      data: {
        id: o.id, code: o.code, customerId: o.customerId, status: OrderStatusCodec.toCode(o.status),
        paymentMethod: PaymentMethodCodec.toCode(o.paymentMethod), paymentStatus: PaymentStatusCodec.toCode(o.paymentStatus),
        subtotalAmount: BigInt(o.subtotal), shippingFee: BigInt(o.shippingFee), totalAmount: BigInt(o.total),
        affiliateId: o.affiliateId, linkId: o.linkId, channelCode: o.channelCode,
        referralCodeUsed: o.referralCodeUsed, attributionSource: AttributionSourceCodec.toCodeOrNull(o.attributionSource),
        isSelfPurchase: o.isSelfPurchase,
        shipName: o.shipName, shipPhone: o.shipPhone, shipProvince: o.shipProvince,
        shipWard: o.shipWard, shipAddressLine: o.shipAddressLine,
        placedAt: o.placedAt, deliveredAt: o.deliveredAt, completedAt: o.completedAt,
        cancelledAt: o.cancelledAt, returnedAt: o.returnedAt, receivedBy: ReceivedByCodec.toCodeOrNull(o.receivedBy),
        cancelReason: o.cancelReason,
        items: {
          create: o.items.map((it) => ({
            id: it.id, productId: it.productId, productName: it.productName,
            unitPrice: BigInt(it.unitPrice), quantity: it.quantity, lineTotal: BigInt(it.lineTotal),
          })),
        },
        history: {
          create: o.history.map((h) => ({
            fromStatus: OrderStatusCodec.toCodeOrNull(h.fromStatus), toStatus: OrderStatusCodec.toCode(h.toStatus),
            actorType: ActorTypeCodec.toCode(h.actorType),
            actorId: h.actorId, note: h.note, createdAt: h.at,
          })),
        },
      },
    });
  }

  await prisma.careNote.createMany({
    data: CARE_NOTES.map((c) => ({
      id: c.id, orderId: c.orderId, note: c.note, contactChannel: ContactChannelCodec.toCode(c.channel),
      contactedAt: c.at, createdBy: ADMIN_ID,
    })),
  });

  console.log(`ordering: ${ORDERS.length} đơn, ${CARE_NOTES.length} ghi chú CSKH, ${ORDERING_SETTINGS.length} cấu hình`);
}

main().finally(() => prisma.$disconnect());
