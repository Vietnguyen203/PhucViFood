import { Inject, Injectable } from '@nestjs/common';
import { AppException, PageResult, parsePageParams } from '@phucvi/shared-library/api';
import {
  ActorTypeCodec, canTransitionOrder, ContactChannelCodec, EventTypes, OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec,
  ReceivedByCodec, type ActorType, type OrderStatus, type ReceivedBy,
} from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { OutboxService } from '@phucvi/shared-library/messaging';
import { daysBetween, normalizeVnPhone } from '@phucvi/shared-library/utils';
import type { Order, Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { CareNoteDto, PaymentDto } from './dto';
import { toAdminView, toAffiliateView, toPublicView, type OrderFull } from './views';

export const ORDERS_SERVICE = Symbol('ORDERS_SERVICE');

export interface Actor { type: ActorType; id: string | null }
interface TransitionExtra { receivedBy?: ReceivedBy; reason?: string; note?: string }

const ORDER_FILTERS = {
  status: { codec: OrderStatusCodec }, paymentMethod: { codec: PaymentMethodCodec }, paymentStatus: { codec: PaymentStatusCodec },
  affiliateId: 'uuid', customerId: 'uuid', isSelfPurchase: 'boolean', placedAt: 'date',
} as const;

const FULL = { items: true, history: true, careNotes: true } as const;

/** Quản trị đơn hàng: danh sách, chi tiết, chuyển trạng thái, thanh toán, ghi chú CSKH. */
@Injectable()
export class OrdersService extends PrismaCrudService<OrderFull> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {
    super(prisma.order, {
      label: 'Đơn hàng',
      sortableFields: ['placedAt', 'totalAmount', 'status', 'deliveredAt'],
      defaultSort: '-placedAt',
      filterableFields: ORDER_FILTERS,
      searchableFields: ['code', 'shipName', 'shipPhone'],
    });
  }

  protected override toResponse(o: OrderFull) {
    return toAdminView(o);
  }

  async getDetail(id: string) {
    this.assertId(id);
    const o = await this.prisma.order.findUnique({ where: { id }, include: FULL });
    if (!o) throw AppException.notFound('Đơn hàng không tồn tại');
    return toAdminView(o);
  }

  // ───────── Chuyển trạng thái ─────────

  /**
   * Chuyển trạng thái một đơn: kiểm tra luồng hợp lệ, cập nhật nguyên tử (chỉ khi trạng thái chưa bị ai đổi),
   * ghi lịch sử và phát sự kiện order.status_changed trong cùng một transaction.
   */
  async transition(order: Order, to: OrderStatus, actor: Actor, extra: TransitionExtra = {}): Promise<OrderFull> {
    const from = OrderStatusCodec.toName(order.status);
    if (!canTransitionOrder(from, to)) throw AppException.businessRule(`Không thể chuyển đơn từ ${from} sang ${to}`);
    if (to === 'SHIPPING' && PaymentMethodCodec.toName(order.paymentMethod) === 'BANK_QR' && PaymentStatusCodec.toName(order.paymentStatus) !== 'PAID') {
      throw AppException.businessRule('Đơn chuyển khoản chưa được xác nhận đã thanh toán, chưa thể giao hàng');
    }

    const now = new Date();
    const data: Prisma.OrderUpdateManyMutationInput = {};
    if (to === 'DELIVERED') data.deliveredAt = now;
    if (to === 'COMPLETED') { data.completedAt = now; data.receivedBy = ReceivedByCodec.toCode(extra.receivedBy ?? 'ADMIN'); }
    if (to === 'CANCELLED') { data.cancelledAt = now; data.cancelReason = extra.reason ?? null; }
    if (to === 'RETURNED') { data.returnedAt = now; data.cancelReason = extra.reason ?? null; }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { ...data, status: OrderStatusCodec.toCode(to) } });
      if (claimed.count === 0) throw AppException.conflict('Trạng thái đơn vừa được thay đổi, vui lòng tải lại');
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id, fromStatus: order.status, toStatus: OrderStatusCodec.toCode(to),
          actorType: ActorTypeCodec.toCode(actor.type), actorId: actor.id, note: extra.reason ?? extra.note ?? null,
        },
      });
      await this.outbox.add('ordering', tx, {
        type: EventTypes.ORDER_STATUS_CHANGED, aggregateType: 'Order', aggregateId: order.id,
        payload: {
          orderId: order.id, code: order.code, fromStatus: from, toStatus: to, actorType: actor.type, actorId: actor.id,
          at: now.toISOString(), receivedBy: to === 'COMPLETED' ? (extra.receivedBy ?? 'ADMIN') : null,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: FULL });
    });
  }

  private async byId(id: string): Promise<Order> {
    this.assertId(id);
    const o = await this.prisma.order.findUnique({ where: { id } });
    if (!o) throw AppException.notFound('Đơn hàng không tồn tại');
    return o;
  }

  async adminTransition(id: string, to: OrderStatus, adminId: string, extra: TransitionExtra = {}) {
    return toAdminView(await this.transition(await this.byId(id), to, { type: 'ADMIN', id: adminId }, extra));
  }

  // ───────── Thanh toán ─────────

  /**
   * Admin ghi nhận thanh toán: PENDING/UNPAID -> PAID (COD thu xong hoặc đối soát chuyển khoản), PAID -> REFUNDED.
   * Mỗi lần đổi được ghi vào lịch sử đơn để đối soát.
   */
  async setPayment(id: string, adminId: string, dto: PaymentDto) {
    const order = await this.byId(id);
    const from = PaymentStatusCodec.toName(order.paymentStatus);
    const status = OrderStatusCodec.toName(order.status);
    if (dto.status === 'PAID') {
      if (from !== 'PENDING' && from !== 'UNPAID') throw AppException.businessRule(`Không thể ghi nhận thanh toán khi trạng thái thanh toán là ${from}`);
      if (status === 'CANCELLED' || status === 'RETURNED') throw AppException.businessRule(`Đơn ${status} không thể ghi nhận thanh toán`);
    } else if (from !== 'PAID') {
      throw AppException.businessRule(`Chỉ hoàn tiền được đơn đã thanh toán (hiện là ${from})`);
    }

    return toAdminView(await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id, paymentStatus: order.paymentStatus }, data: { paymentStatus: PaymentStatusCodec.toCode(dto.status) } });
      if (claimed.count === 0) throw AppException.conflict('Trạng thái thanh toán vừa được thay đổi, vui lòng tải lại');
      await tx.orderStatusHistory.create({
        data: {
          orderId: id, fromStatus: order.status, toStatus: order.status, actorType: ActorTypeCodec.toCode('ADMIN'), actorId: adminId,
          note: `Thanh toán: ${from} -> ${dto.status}${dto.note ? ` (${dto.note})` : ''}`,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id }, include: FULL });
    }));
  }

  // ───────── CSKH ─────────

  async addCareNote(id: string, adminId: string, dto: CareNoteDto) {
    await this.byId(id);
    const n = await this.prisma.careNote.create({
      data: { orderId: id, note: dto.note, contactChannel: ContactChannelCodec.toCodeOrNull(dto.contactChannel as never), createdBy: adminId },
    });
    return { id: n.id, orderId: n.orderId, note: n.note, contactChannel: ContactChannelCodec.toNameOrNull(n.contactChannel), contactedAt: n.contactedAt, createdBy: n.createdBy };
  }

  /**
   * Hàng chờ CSKH: đơn DELIVERED chưa COMPLETED, đơn giao lâu nhất lên đầu, kèm ghi chú liên hệ gần nhất.
   * CSKH gọi hỏi khách đã nhận hàng chưa, rồi admin chuyển COMPLETED.
   */
  async cskhQueue(query: Record<string, unknown>) {
    const { page, pageSize, skip, take } = parsePageParams(query);
    const where = { status: OrderStatusCodec.toCode('DELIVERED') };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where, orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }], skip, take,
        include: { careNotes: { orderBy: { contactedAt: 'desc' }, take: 1 }, _count: { select: { careNotes: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    const now = new Date();
    const items = rows.map((o) => ({
      id: o.id, code: o.code, shipName: o.shipName, shipPhone: o.shipPhone, totalAmount: o.totalAmount,
      deliveredAt: o.deliveredAt, daysWaiting: o.deliveredAt ? daysBetween(o.deliveredAt, now) : 0,
      careNoteCount: o._count.careNotes,
      lastCareNote: o.careNotes[0]
        ? { note: o.careNotes[0].note, contactChannel: ContactChannelCodec.toNameOrNull(o.careNotes[0].contactChannel), contactedAt: o.careNotes[0].contactedAt }
        : null,
    }));
    return new PageResult(items, total, page, pageSize);
  }

  // ───────── Khách tự thao tác (xác minh bằng mã đơn + SĐT) ─────────

  /** Tìm đơn theo mã và SĐT đặt hàng. Sai SĐT cũng trả 404 để không lộ mã đơn nào tồn tại. */
  async findForCustomer(code: string, phone: string): Promise<OrderFull> {
    const normalized = normalizeVnPhone(phone);
    const o = normalized ? await this.prisma.order.findUnique({ where: { code: code.toUpperCase() }, include: { items: true, history: true } }) : null;
    if (!o || o.shipPhone !== normalized) throw AppException.notFound('Không tìm thấy đơn hàng với mã và số điện thoại này');
    return o;
  }

  async publicView(code: string, phone: string) {
    return toPublicView(await this.findForCustomer(code, phone), await this.settings.bankAccount());
  }

  /** Khách xác nhận đã nhận hàng: DELIVERED -> COMPLETED (receivedBy CUSTOMER); hoa hồng của CTV được xác nhận theo. */
  async confirmReceived(code: string, phone: string) {
    const order = await this.findForCustomer(code, phone);
    if (OrderStatusCodec.toName(order.status) !== 'DELIVERED') throw AppException.businessRule('Chỉ xác nhận nhận hàng được khi đơn đã giao');
    const updated = await this.transition(order, 'COMPLETED', { type: 'CUSTOMER', id: null }, { receivedBy: 'CUSTOMER' });
    return toPublicView(updated, null);
  }

  /** Khách tự hủy khi đơn chưa giao cho đơn vị vận chuyển (PLACED hoặc CONFIRMED). */
  async cancelByCustomer(code: string, phone: string, reason?: string) {
    const order = await this.findForCustomer(code, phone);
    const status = OrderStatusCodec.toName(order.status);
    if (status !== 'PLACED' && status !== 'CONFIRMED') {
      throw AppException.businessRule('Đơn đã được giao cho đơn vị vận chuyển, vui lòng liên hệ cửa hàng để hủy');
    }
    const updated = await this.transition(order, 'CANCELLED', { type: 'CUSTOMER', id: null }, { reason: reason || 'Khách hủy đơn' });
    return toPublicView(updated, null);
  }
}

/** CTV xem đơn do mình giới thiệu: chỉ tên viết tắt của khách, không có SĐT hay địa chỉ. */
@Injectable()
export class AffiliateOrdersService extends PrismaCrudService<OrderFull> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma.order, {
      label: 'Đơn hàng',
      sortableFields: ['placedAt', 'totalAmount', 'status'],
      defaultSort: '-placedAt',
      filterableFields: { status: { codec: OrderStatusCodec }, placedAt: 'date' },
      searchableFields: ['code'],
      include: { items: true },
    });
  }

  protected override toResponse(o: OrderFull) {
    return toAffiliateView(o);
  }
}

/** Khách đã đăng nhập xem đơn của chính mình (đơn đặt khi đã đăng nhập). */
@Injectable()
export class MyOrdersService extends PrismaCrudService<OrderFull> {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {
    super(db.order, {
      label: 'Đơn hàng',
      sortableFields: ['placedAt', 'totalAmount', 'status'],
      defaultSort: '-placedAt',
      filterableFields: { status: { codec: OrderStatusCodec }, placedAt: 'date' },
      searchableFields: ['code'],
      include: { items: true },
    });
  }

  /** Danh sách gọn: không kèm hướng dẫn chuyển khoản (xem ở chi tiết). */
  protected override toResponse(o: OrderFull) {
    return toPublicView(o, null);
  }

  /** Chi tiết một đơn của mình theo mã đơn, kèm lịch sử trạng thái và hướng dẫn chuyển khoản. Đơn của người khác: 404. */
  async detail(userId: string, code: string) {
    const order = await this.db.order.findFirst({ where: { code, userId }, include: { items: true, history: true } });
    if (!order) throw AppException.notFound('Không tìm thấy đơn hàng');
    return toPublicView(order as OrderFull, await this.settings.bankAccount());
  }
}
