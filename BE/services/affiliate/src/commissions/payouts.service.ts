import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { AdjustmentStatusCodec, CommissionStatusCodec } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Payout, Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionNotifier } from './commission-notifier';
import type { CreatePayoutDto } from './dto';

export const PAYOUTS_SERVICE = Symbol('PAYOUTS_SERVICE');

type PayoutWithCommissions = Payout & {
  commissions?: Array<{ id: string; orderCode: string; amount: bigint }>;
  adjustments?: Array<{ id: string; orderCode: string; amount: bigint }>;
};

export const toPayoutView = (p: PayoutWithCommissions) => ({
  id: p.id,
  affiliateId: p.affiliateId,
  /** Số tiền thực chuyển cho CTV = tổng hoa hồng trong đợt - adjustmentAmount. */
  totalAmount: p.totalAmount,
  /** Tổng các khoản trừ (đơn hoàn sau khi đã chi) được trừ vào đợt này. */
  adjustmentAmount: p.adjustmentAmount,
  paidAt: p.paidAt,
  paymentReference: p.paymentReference,
  note: p.note,
  createdBy: p.createdBy,
  createdAt: p.createdAt,
  ...(p.commissions ? { commissions: p.commissions.map((c) => ({ id: c.id, orderCode: c.orderCode, amount: c.amount })) } : {}),
  ...(p.adjustments ? { adjustments: p.adjustments.map((a) => ({ id: a.id, orderCode: a.orderCode, amount: a.amount })) } : {}),
});

/**
 * Chi trả hoa hồng theo đợt: gom các hoa hồng CONFIRMED của một CTV thành một payout và chuyển sang PAID.
 * Các khoản trừ chờ (đơn hoàn sau khi đã chi, xem AdjustmentsService) được trừ vào đợt này, cũ nhất trước, và chỉ trừ trọn từng khoản
 * khi còn đủ tiền; khoản chưa trừ hết được giữ lại cho đợt sau. Số tiền thực chuyển không bao giờ âm.
 */
@Injectable()
export class PayoutsService extends PrismaCrudService<PayoutWithCommissions> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CommissionNotifier) private readonly notifier: CommissionNotifier,
  ) {
    super(prisma.payout, {
      label: 'Đợt chi trả',
      sortableFields: ['paidAt', 'createdAt', 'totalAmount'],
      filterableFields: { affiliateId: 'uuid', paidAt: 'date' },
      searchableFields: ['paymentReference'],
      include: {
        commissions: { select: { id: true, orderCode: true, amount: true }, orderBy: { orderCode: 'asc' } },
        adjustments: { select: { id: true, orderCode: true, amount: true }, orderBy: { orderCode: 'asc' } },
      },
    });
  }

  protected override toResponse(p: PayoutWithCommissions) {
    return toPayoutView(p);
  }

  /**
   * Tạo đợt chi trả. Không truyền commissionIds thì lấy TẤT CẢ hoa hồng CONFIRMED chưa chi của CTV.
   * Toàn bộ trong một transaction: sai một dòng là hủy cả đợt, không có trạng thái nửa vời.
   */
  async createPayout(adminId: string, dto: CreatePayoutDto) {
    const ids = dto.commissionIds ? [...new Set(dto.commissionIds)] : null;

    const payout = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const affiliate = await tx.affiliate.findUnique({ where: { id: dto.affiliateId }, select: { id: true } });
      if (!affiliate) throw AppException.notFound('Cộng tác viên không tồn tại');

      const confirmed = CommissionStatusCodec.toCode('CONFIRMED');
      const candidates = await tx.commission.findMany({
        where: { affiliateId: dto.affiliateId, status: confirmed, payoutId: null, ...(ids ? { id: { in: ids } } : {}) },
        select: { id: true, orderId: true, affiliateId: true, amount: true },
      });
      if (ids && candidates.length !== ids.length) {
        throw AppException.businessRule('Có hoa hồng không thuộc cộng tác viên này, chưa xác nhận hoặc đã được chi trả');
      }
      if (candidates.length === 0) throw AppException.businessRule('Không có hoa hồng đã xác nhận nào để chi trả');

      const gross = candidates.reduce((sum, c) => sum + c.amount, 0n);
      if (gross <= 0n) throw AppException.businessRule('Tổng tiền chi trả phải lớn hơn 0');

      // Khoản trừ chờ, cũ nhất trước; trừ trọn từng khoản khi còn đủ, khoản không vừa thì để đợt sau.
      const pending = await tx.adjustment.findMany({
        where: { affiliateId: dto.affiliateId, status: AdjustmentStatusCodec.toCode('PENDING') },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      let remaining = gross;
      const applied: typeof pending = [];
      for (const a of pending) {
        if (a.amount <= remaining) { applied.push(a); remaining -= a.amount; }
      }
      const adjustmentAmount = gross - remaining;

      const paidAt = new Date();
      const created = await tx.payout.create({
        data: {
          affiliateId: dto.affiliateId, totalAmount: remaining, adjustmentAmount, paidAt, createdBy: adminId,
          paymentReference: dto.paymentReference, note: dto.note,
        },
      });
      // Nguyên tử: chỉ chuyển các dòng vẫn còn CONFIRMED và chưa có payout (chặn hai admin chi cùng lúc).
      const claimed = await tx.commission.updateMany({
        where: { id: { in: candidates.map((c) => c.id) }, status: confirmed, payoutId: null },
        data: { status: CommissionStatusCodec.toCode('PAID'), paidAt, payoutId: created.id },
      });
      if (claimed.count !== candidates.length) throw AppException.conflict('Hoa hồng vừa được thay đổi bởi thao tác khác, vui lòng thử lại');

      if (applied.length > 0) {
        // Nguyên tử: chỉ trừ các khoản vẫn còn PENDING (admin có thể vừa miễn trừ, hoặc đợt chi khác vừa trừ).
        const taken = await tx.adjustment.updateMany({
          where: { id: { in: applied.map((a) => a.id) }, status: AdjustmentStatusCodec.toCode('PENDING') },
          data: { status: AdjustmentStatusCodec.toCode('APPLIED'), appliedPayoutId: created.id, appliedAt: paidAt },
        });
        if (taken.count !== applied.length) throw AppException.conflict('Khoản trừ vừa được thay đổi bởi thao tác khác, vui lòng thử lại');
      }

      for (const c of candidates) await this.notifier.emit(tx, c, 'CONFIRMED', 'PAID');
      return created;
    });

    return this.findOne(payout.id);
  }
}
