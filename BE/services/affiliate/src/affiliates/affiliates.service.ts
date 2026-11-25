import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import type { AuthUser } from '@phucvi/shared-library/auth';
import { AffiliateStatusCodec, EventTypes, type AffiliateStatus } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import { OutboxService } from '@phucvi/shared-library/messaging';
import { normalizeVnPhone } from '@phucvi/shared-library/utils';
import type { Affiliate, Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ApproveDto, CreateProfileDto, NoteDto, UpdateAffiliateAdminDto, UpdateProfileDto } from './dto';

export const AFFILIATES_SERVICE = Symbol('AFFILIATES_SERVICE');

const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);

/** Trạng thái CTV: PENDING -> ACTIVE | REJECTED; ACTIVE <-> SUSPENDED. REJECTED là trạng thái cuối. */
export const AFFILIATE_TRANSITIONS: Record<AffiliateStatus, readonly AffiliateStatus[]> = {
  PENDING: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['SUSPENDED'],
  SUSPENDED: ['ACTIVE'],
  REJECTED: [],
};

export const toAffiliateView = (a: Affiliate) => ({
  id: a.id,
  userId: a.userId,
  fullName: a.fullName,
  phone: a.phone,
  referralCode: a.referralCode,
  status: AffiliateStatusCodec.toName(a.status),
  contractStart: dateOnly(a.contractStart),
  contractEnd: dateOnly(a.contractEnd),
  commissionRateBps: a.commissionRateBps,
  bankName: a.bankName,
  bankAccountNo: a.bankAccountNo,
  bankAccountHolder: a.bankAccountHolder,
  approvedAt: a.approvedAt,
  note: a.note,
  createdAt: a.createdAt,
});

function assertContractRange(start: string | null | undefined, end: string | null | undefined): void {
  if (start && end && end < start) {
    throw AppException.validation([{ field: 'contractEnd', messages: ['ngày kết thúc phải từ ngày bắt đầu trở đi'] }]);
  }
}

@Injectable()
export class AffiliatesService extends PrismaCrudService<Affiliate, never, UpdateAffiliateAdminDto> {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super(prisma.affiliate, {
      label: 'Cộng tác viên',
      sortableFields: ['createdAt', 'fullName', 'referralCode', 'status'],
      filterableFields: { status: { codec: AffiliateStatusCodec }, createdAt: 'date' },
      searchableFields: ['fullName', 'phone', 'referralCode'],
    });
  }

  protected override toResponse(a: Affiliate) {
    return toAffiliateView(a);
  }

  // ───────── CTV tự quản lý hồ sơ ─────────

  async getMineOrThrow(userId: string): Promise<Affiliate> {
    const mine = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!mine) throw AppException.notFound('Bạn chưa đăng ký hồ sơ cộng tác viên');
    return mine;
  }

  async getMine(userId: string) {
    return toAffiliateView(await this.getMineOrThrow(userId));
  }

  async createProfile(user: AuthUser, dto: CreateProfileDto) {
    const phone = normalizeVnPhone(dto.phone)!; // đã kiểm tra ở DTO
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const a = await tx.affiliate.create({
          data: {
            userId: user.id, fullName: dto.fullName, phone, referralCode: dto.referralCode,
            status: AffiliateStatusCodec.toCode('PENDING'),
            bankName: dto.bankName, bankAccountNo: dto.bankAccountNo, bankAccountHolder: dto.bankAccountHolder,
          },
        });
        await this.emitStatus(tx, a, null, 'PENDING');
        return a;
      });
      return toAffiliateView(created);
    } catch (e) {
      throw this.uniqueViolation(e);
    }
  }

  async updateMine(userId: string, dto: UpdateProfileDto) {
    const mine = await this.getMineOrThrow(userId);
    const updated = await this.prisma.affiliate.update({
      where: { id: mine.id },
      data: { fullName: dto.fullName, bankName: dto.bankName, bankAccountNo: dto.bankAccountNo, bankAccountHolder: dto.bankAccountHolder },
    });
    return toAffiliateView(updated);
  }

  // ───────── Admin ─────────

  approve(id: string, dto: ApproveDto) {
    assertContractRange(dto.contractStart, dto.contractEnd);
    return this.transition(id, 'ACTIVE', {
      approvedAt: new Date(),
      contractStart: toDate(dto.contractStart),
      contractEnd: dto.contractEnd ? toDate(dto.contractEnd) : null,
      ...(dto.commissionRateBps !== undefined ? { commissionRateBps: dto.commissionRateBps } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
    });
  }

  reject(id: string, dto: NoteDto) {
    return this.transition(id, 'REJECTED', dto.note !== undefined ? { note: dto.note } : {});
  }

  suspend(id: string, dto: NoteDto) {
    return this.transition(id, 'SUSPENDED', dto.note !== undefined ? { note: dto.note } : {});
  }

  reactivate(id: string, dto: NoteDto) {
    return this.transition(id, 'ACTIVE', dto.note !== undefined ? { note: dto.note } : {});
  }

  /** Admin chỉnh hợp đồng, tỷ lệ, ghi chú. Tỷ lệ mới chỉ áp cho đơn đặt SAU đó (đơn cũ đã chốt snapshot). */
  override async update(id: string, dto: UpdateAffiliateAdminDto) {
    const current = await this.findOrThrow(id);
    assertContractRange(dto.contractStart ?? dateOnly(current.contractStart), dto.contractEnd ?? dateOnly(current.contractEnd));
    const updated = await this.prisma.affiliate.update({
      where: { id },
      data: {
        commissionRateBps: dto.commissionRateBps, note: dto.note,
        contractStart: dto.contractStart ? toDate(dto.contractStart) : undefined,
        contractEnd: dto.contractEnd ? toDate(dto.contractEnd) : undefined,
      },
    });
    return toAffiliateView(updated);
  }

  private async transition(id: string, to: AffiliateStatus, data: Prisma.AffiliateUpdateManyMutationInput) {
    const target = await this.findOrThrow(id);
    const from = AffiliateStatusCodec.toName(target.status);
    if (!AFFILIATE_TRANSITIONS[from].includes(to)) {
      throw AppException.businessRule(`Không thể chuyển cộng tác viên từ ${from} sang ${to}`);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Nguyên tử: chỉ đổi nếu trạng thái vẫn là `from`, tránh hai admin thao tác cùng lúc.
      const claimed = await tx.affiliate.updateMany({
        where: { id, status: target.status }, data: { ...data, status: AffiliateStatusCodec.toCode(to) },
      });
      if (claimed.count === 0) throw AppException.conflict('Trạng thái cộng tác viên vừa được thay đổi, vui lòng tải lại');
      const fresh = await tx.affiliate.findUniqueOrThrow({ where: { id } });
      await this.emitStatus(tx, fresh, from, to);
      return fresh;
    });
    return toAffiliateView(updated);
  }

  private emitStatus(tx: Prisma.TransactionClient, a: Affiliate, from: AffiliateStatus | null, to: AffiliateStatus) {
    return this.outbox.add('affiliate', tx, {
      type: EventTypes.AFFILIATE_STATUS_CHANGED, aggregateType: 'Affiliate', aggregateId: a.id,
      payload: { affiliateId: a.id, userId: a.userId, fromStatus: from, toStatus: to },
    });
  }

  private uniqueViolation(e: unknown): unknown {
    const err = e as { code?: string; meta?: { target?: unknown } };
    if (err.code !== 'P2002') return e;
    const target = JSON.stringify(err.meta?.target ?? '');
    if (target.includes('phone')) return AppException.conflict('Số điện thoại đã được đăng ký cho cộng tác viên khác');
    if (target.includes('referral_code')) return AppException.conflict('Mã giới thiệu đã được sử dụng');
    return AppException.conflict('Bạn đã có hồ sơ cộng tác viên');
  }
}
