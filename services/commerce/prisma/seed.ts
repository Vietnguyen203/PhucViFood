// Seed commerce_db: danh mục, sản phẩm, khách, đơn ở đủ trạng thái, lịch sử, ghi chú CSKH, settings.
import {
  ADMIN_ID, CARE_NOTES, CATEGORIES, CUSTOMERS, CUSTOMER_SETTINGS, ORDERING_SETTINGS, ORDERS, PRODUCTS,
} from '@phucvi/shared-library';
import { PrismaClient } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  // Xóa theo thứ tự phụ thuộc để chạy lại được nhiều lần.
  await prisma.order.deleteMany(); // cascade: items, history, care notes
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exportLog.deleteMany();
  await prisma.orderingSetting.deleteMany();
  await prisma.customerSetting.deleteMany();

  await prisma.category.createMany({ data: CATEGORIES });
  await prisma.product.createMany({
    data: PRODUCTS.map((p) => ({
      id: p.id, categoryId: p.categoryId, name: p.name, slug: p.slug, sku: p.sku, unit: p.unit,
      price: BigInt(p.price), originalPrice: p.originalPrice ? BigInt(p.originalPrice) : null,
      stockQuantity: p.stock,
    })),
  });

  await prisma.customer.createMany({
    data: CUSTOMERS.map((c) => ({
      id: c.id, phone: c.phone, fullName: c.fullName, email: c.email, province: c.province, ward: c.ward,
      addressLine: c.addressLine, firstAffiliateId: c.firstAffiliateId, firstChannelCode: c.firstChannelCode,
      marketingConsent: c.consent, consentAt: c.consentAt,
    })),
  });

  await prisma.orderingSetting.createMany({ data: ORDERING_SETTINGS });
  await prisma.customerSetting.createMany({ data: CUSTOMER_SETTINGS });

  for (const o of ORDERS) {
    await prisma.order.create({
      data: {
        id: o.id, code: o.code, customerId: o.customerId, status: o.status,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
        subtotalAmount: BigInt(o.subtotal), shippingFee: BigInt(o.shippingFee), totalAmount: BigInt(o.total),
        affiliateId: o.affiliateId, linkId: o.linkId, channelCode: o.channelCode,
        referralCodeUsed: o.referralCodeUsed, attributionSource: o.attributionSource,
        isSelfPurchase: o.isSelfPurchase,
        shipName: o.shipName, shipPhone: o.shipPhone, shipProvince: o.shipProvince,
        shipWard: o.shipWard, shipAddressLine: o.shipAddressLine,
        placedAt: o.placedAt, deliveredAt: o.deliveredAt, completedAt: o.completedAt,
        cancelledAt: o.cancelledAt, returnedAt: o.returnedAt, receivedBy: o.receivedBy,
        cancelReason: o.cancelReason,
        items: {
          create: o.items.map((it) => ({
            id: it.id, productId: it.productId, productName: it.productName,
            unitPrice: BigInt(it.unitPrice), quantity: it.quantity, lineTotal: BigInt(it.lineTotal),
          })),
        },
        history: {
          create: o.history.map((h) => ({
            fromStatus: h.fromStatus, toStatus: h.toStatus, actorType: h.actorType,
            actorId: h.actorId, note: h.note, createdAt: h.at,
          })),
        },
      },
    });
  }

  await prisma.careNote.createMany({
    data: CARE_NOTES.map((c) => ({
      id: c.id, orderId: c.orderId, note: c.note, contactChannel: c.channel,
      contactedAt: c.at, createdBy: ADMIN_ID,
    })),
  });

  await prisma.exportLog.create({
    data: { exportedBy: ADMIN_ID, filters: { segment: 'VIP' }, rowCount: 1, format: 'xlsx' },
  });

  console.log(
    `commerce: ${CATEGORIES.length} danh mục, ${PRODUCTS.length} sản phẩm, ${CUSTOMERS.length} khách, ` +
      `${ORDERS.length} đơn, ${CARE_NOTES.length} ghi chú CSKH`,
  );
}

main().finally(() => prisma.$disconnect());
