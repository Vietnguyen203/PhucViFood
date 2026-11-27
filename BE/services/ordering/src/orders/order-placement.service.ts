import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import {
  ActorTypeCodec, AttributionSourceCodec, EventTypes, OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec,
  type PaymentMethod,
} from '@phucvi/shared-library/contracts';
import { OutboxService } from '@phucvi/shared-library/messaging';
import { calculateShippingFee, normalizeVnPhone, toSafeNumber, uuidv7 } from '@phucvi/shared-library/utils';
import type { Prisma } from '../../generated/client';
import { AffiliateClient, Attribution, CatalogClient, CustomerClient, Reservation, toClientError } from '../clients/clients';
import { generateOrderCode, orderIdFromKey } from '../common/validators';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { PlaceOrderDto } from './dto';
import type { OrderFull } from './views';

const GUEST: Attribution = {
  affiliateId: null, linkId: null, channelCode: null, referralCodeUsed: null, attributionSource: null,
  isSelfPurchase: false, commissionEligible: false, commissionRateBps: null, reason: 'NO_AFFILIATE',
};

const isUnique = (e: unknown, field?: string): boolean => {
  const err = e as { code?: string; meta?: { target?: unknown } };
  return err.code === 'P2002' && (!field || JSON.stringify(err.meta?.target ?? '').includes(field));
};

/**
 * Đặt hàng của khách vãng lai. Thứ tự các bước (mỗi bước chỉ làm khi bước trước thành công,
 * để lỗi sớm thì chưa có gì cần hoàn tác):
 *   1. Hỏi affiliate: đơn gắn CTV nào, có hoa hồng không (chỉ khi khách có mã hoặc cookie)
 *   2. Lấy khách từ customer (tìm hoặc tạo theo SĐT)
 *   3. Giữ hàng ở catalog (trừ tồn, lấy snapshot tên và giá)
 *   4. Tạo đơn + lịch sử + sự kiện order.placed trong MỘT transaction
 * Bước 4 lỗi thì trả hàng lại cho catalog (bồi hoàn).
 */
@Injectable()
export class OrderPlacementService {
  private readonly logger = new Logger('OrderPlacement');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(CatalogClient) private readonly catalog: CatalogClient,
    @Inject(AffiliateClient) private readonly affiliates: AffiliateClient,
    @Inject(CustomerClient) private readonly customers: CustomerClient,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  private findByKey(key: string): Promise<OrderFull | null> {
    return this.prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true, history: true } });
  }

  async place(dto: PlaceOrderDto, idempotencyKey?: string, userId?: string | null): Promise<{ order: OrderFull; replayed: boolean }> {
    // Cùng Idempotency-Key: trả lại đúng đơn đã tạo (khách bấm đúp, mạng chập chờn thử lại).
    if (idempotencyKey) {
      const existing = await this.findByKey(idempotencyKey);
      if (existing) return { order: existing, replayed: true };
    }

    const phone = normalizeVnPhone(dto.customer.phone)!; // đã kiểm tra ở DTO
    const orderId = idempotencyKey ? orderIdFromKey(idempotencyKey) : uuidv7();
    const placedAt = new Date();
    const wanted = this.mergeItems(dto.items);

    // 1. Ghi nhận CTV
    let attribution = GUEST;
    if (dto.referralCode || dto.cookie) {
      try {
        attribution = await this.affiliates.resolveAttribution({
          referralCode: dto.referralCode, cookie: dto.cookie, customerPhone: phone, orderedAt: placedAt.toISOString(),
        });
      } catch (e) {
        throw toClientError(e, 'Không xác nhận được mã giới thiệu, vui lòng thử lại');
      }
    }

    // 2. Khách hàng
    let customerId: string;
    try {
      const c = dto.customer;
      customerId = (await this.customers.upsert({
        phone, fullName: c.fullName, email: c.email, province: c.province, ward: c.ward, addressLine: c.addressLine,
        marketingConsent: c.marketingConsent ?? false,
        // Nguồn đầu tiên chỉ tính khi đơn thật sự thuộc CTV (tự mua và hết hạn hợp đồng thì không tính).
        firstAffiliateId: attribution.commissionEligible ? attribution.affiliateId : null,
        firstChannelCode: attribution.commissionEligible ? attribution.channelCode : null,
      })).id;
    } catch (e) {
      throw toClientError(e, 'Không lưu được thông tin khách hàng, vui lòng thử lại');
    }

    // 3. Giữ hàng
    let reservation: Reservation;
    try {
      reservation = await this.catalog.reserve(orderId, wanted);
    } catch (e) {
      throw toClientError(e, 'Không giữ được hàng, vui lòng thử lại');
    }

    // 4. Tạo đơn; lỗi thì bồi hoàn
    try {
      this.assertReservationMatches(wanted, reservation);
      const order = await this.persist({ orderId, idempotencyKey, customerId, userId: userId ?? null, phone, dto, attribution, reservation, placedAt });
      return { order, replayed: false };
    } catch (e) {
      // Hai yêu cầu song song cùng Idempotency-Key: một bên tạo xong, bên kia thua ở unique và trả lại đơn đã có.
      // Hàng đã giữ dùng chung orderId nên KHÔNG trả lại.
      if (idempotencyKey && (isUnique(e, 'idempotency_key') || isUnique(e, 'id'))) {
        const existing = await this.findByKey(idempotencyKey);
        if (existing) return { order: existing, replayed: true };
      }
      await this.catalog.release(orderId).catch((re) => this.logger.error(`Không trả được hàng cho đơn ${orderId} sau khi tạo đơn lỗi: ${re}`));
      if (e instanceof AppException) throw e;
      this.logger.error(`Tạo đơn ${orderId} lỗi: ${e instanceof Error ? e.stack : e}`);
      throw e;
    }
  }

  private mergeItems(items: PlaceOrderDto['items']): Array<{ productId: string; quantity: number }> {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
    const over = [...map.entries()].filter(([, q]) => q > 1000);
    if (over.length) throw AppException.validation(over.map(([productId]) => ({ field: 'items', messages: [`tổng số lượng sản phẩm ${productId} tối đa 1000`] })));
    return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  /** Không tin mù quáng vào phản hồi của service khác: kiểm tra đúng sản phẩm và số lượng đã yêu cầu. */
  private assertReservationMatches(wanted: Array<{ productId: string; quantity: number }>, r: Reservation): void {
    const ok = r.items.length === wanted.length && wanted.every((w) => r.items.some((i) => i.productId === w.productId && i.quantity === w.quantity));
    if (!ok) throw AppException.unavailable('Dữ liệu giữ hàng không khớp, vui lòng thử lại');
  }

  private async persist(a: {
    orderId: string; idempotencyKey?: string; customerId: string; userId: string | null; phone: string; dto: PlaceOrderDto;
    attribution: Attribution; reservation: Reservation; placedAt: Date;
  }): Promise<OrderFull> {
    // Tính lại tiền từ snapshot (không tin lineTotal/subtotal của service khác).
    const items = a.reservation.items.map((i) => ({ ...i, lineTotal: BigInt(i.unitPrice) * BigInt(i.quantity) }));
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0n);
    const shippingFee = BigInt(calculateShippingFee(toSafeNumber(subtotal), await this.settings.shippingRule()));
    const method = a.dto.paymentMethod as PaymentMethod;
    const paymentStatus = method === 'COD' ? 'PENDING' : 'UNPAID'; // COD thu khi giao; chuyển khoản chờ admin đối soát; VNPay chờ cổng báo về
    const c = a.dto.customer;
    // Đơn trả trước (chuyển khoản, VNPay) chưa trả chỉ được giữ hàng đến hạn này; COD không hết hạn.
    const paymentDueAt = method !== 'COD' ? new Date(a.placedAt.getTime() + (await this.settings.paymentHoldMinutes()) * 60_000) : null;

    for (let attempt = 1; ; attempt++) {
      const code = generateOrderCode(a.placedAt);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              id: a.orderId, code, idempotencyKey: a.idempotencyKey ?? null, customerId: a.customerId, userId: a.userId,
              status: OrderStatusCodec.toCode('PLACED'),
              paymentMethod: PaymentMethodCodec.toCode(method), paymentStatus: PaymentStatusCodec.toCode(paymentStatus),
              subtotalAmount: subtotal, shippingFee, totalAmount: subtotal + shippingFee,
              affiliateId: a.attribution.affiliateId, linkId: a.attribution.linkId, channelCode: a.attribution.channelCode,
              referralCodeUsed: a.attribution.referralCodeUsed,
              attributionSource: AttributionSourceCodec.toCodeOrNull(a.attribution.attributionSource),
              isSelfPurchase: a.attribution.isSelfPurchase,
              shipName: c.fullName, shipPhone: a.phone, shipProvince: c.province, shipWard: c.ward, shipAddressLine: c.addressLine,
              customerNote: a.dto.note, placedAt: a.placedAt, paymentDueAt,
              items: { create: items.map((i) => ({ productId: i.productId, productName: i.name, unitPrice: BigInt(i.unitPrice), quantity: i.quantity, lineTotal: i.lineTotal })) },
              history: { create: { fromStatus: null, toStatus: OrderStatusCodec.toCode('PLACED'), actorType: ActorTypeCodec.toCode('CUSTOMER') } },
            },
            include: { items: true, history: true },
          });
          await this.emitPlaced(tx, order, a.attribution);
          return order;
        });
      } catch (e) {
        if (isUnique(e, 'code') && attempt < 5) continue; // trùng mã đơn (hiếm): sinh mã khác
        throw e;
      }
    }
  }

  private emitPlaced(tx: Prisma.TransactionClient, o: NonNullable<OrderFull> & { items: Array<{ productId: string; quantity: number }> }, attribution: Attribution) {
    return this.outbox.add('ordering', tx, {
      type: EventTypes.ORDER_PLACED, aggregateType: 'Order', aggregateId: o.id,
      payload: {
        orderId: o.id, code: o.code, customerId: o.customerId, placedAt: o.placedAt.toISOString(),
        subtotalAmount: toSafeNumber(o.subtotalAmount), shippingFee: toSafeNumber(o.shippingFee), totalAmount: toSafeNumber(o.totalAmount),
        affiliateId: o.affiliateId, linkId: o.linkId, channelCode: o.channelCode, referralCodeUsed: o.referralCodeUsed,
        attributionSource: attribution.attributionSource, isSelfPurchase: o.isSelfPurchase,
        // Chỉ có tỷ lệ khi đơn thật sự được tính hoa hồng; affiliate dựa vào đây để tạo hoa hồng.
        commissionRateBps: attribution.commissionEligible ? attribution.commissionRateBps : null,
        items: o.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      },
    });
  }
}
