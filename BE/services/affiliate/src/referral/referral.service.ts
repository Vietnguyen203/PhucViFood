import { Inject, Injectable } from '@nestjs/common';
import { AffiliateStatusCodec } from '@phucvi/shared-library/contracts';
import {
  chooseReferral, decideAttribution, isContractActiveOn, normalizeChannelCode, normalizeReferralCode, normalizeVnPhone,
  type AffiliateSnapshot,
} from '@phucvi/shared-library/utils';
import type { Affiliate } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ReferralContextDto, ResolveAttributionDto } from './dto';
import { SettingsService } from './settings.service';

export const toSnapshot = (a: Affiliate): AffiliateSnapshot => ({
  id: a.id,
  status: AffiliateStatusCodec.toName(a.status),
  phone: a.phone,
  contractStart: a.contractStart,
  contractEnd: a.contractEnd,
  commissionRateBps: a.commissionRateBps,
});

@Injectable()
export class ReferralService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /** Tra mã không phân biệt hoa thường (mã luôn lưu chữ thường). */
  findByCode(code: string | null | undefined): Promise<Affiliate | null> {
    const normalized = normalizeReferralCode(code);
    return normalized ? this.prisma.affiliate.findUnique({ where: { referralCode: normalized } }) : Promise.resolve(null);
  }

  /** Tra hồ sơ CTV theo tài khoản đăng nhập (user service). Dùng cho service khác biết CTV nào đang đăng nhập. */
  async lookupByUser(userId: string): Promise<{ affiliateId: string; referralCode: string; status: string } | null> {
    const a = await this.prisma.affiliate.findUnique({ where: { userId } });
    return a ? { affiliateId: a.id, referralCode: a.referralCode, status: AffiliateStatusCodec.toName(a.status) } : null;
  }

  /** CTV còn hiệu lực tại thời điểm `at`: ACTIVE và trong thời hạn hợp đồng. */
  async findActiveByCode(code: string | null | undefined, at: Date = new Date()): Promise<Affiliate | null> {
    const a = await this.findByCode(code);
    return a && isContractActiveOn(at, toSnapshot(a)) ? a : null;
  }

  private async linkFor(affiliateId: string, channelCode: string | null) {
    if (!channelCode) return null;
    return this.prisma.affiliateLink.findFirst({ where: { affiliateId, channelCode, isActive: true } });
  }

  async validate(code: string): Promise<{ valid: boolean }> {
    return { valid: (await this.findActiveByCode(code)) !== null };
  }

  /**
   * Cho service tracking: mã (và kênh) có thuộc CTV còn hiệu lực không; kèm link theo kênh và số ngày cookie.
   * Chỉ đọc, không ghi gì. Luôn trả 200: mã không dùng được là `valid:false`, không phải lỗi.
   */
  async referralContext(dto: ReferralContextDto) {
    const affiliate = await this.findActiveByCode(dto.code);
    if (!affiliate) return { valid: false as const };
    const link = await this.linkFor(affiliate.id, normalizeChannelCode(dto.channel));
    return { valid: true as const, affiliateId: affiliate.id, referralCode: affiliate.referralCode, linkId: link?.id ?? null, cookieDays: await this.settings.cookieDays() };
  }

  /**
   * Quyết định ghi nhận CTV cho một đơn (ordering gọi lúc đặt hàng):
   * mã khách nhập ưu tiên hơn cookie; cookie quá hạn bị bỏ; hợp đồng kiểm tra theo NGÀY ĐẶT HÀNG;
   * CTV tự mua (SĐT khách trùng SĐT CTV) giữ liên kết nhưng không có hoa hồng.
   */
  async resolveAttribution(dto: ResolveAttributionDto) {
    const orderedAt = dto.orderedAt ? new Date(dto.orderedAt) : new Date();
    const customerPhone = normalizeVnPhone(dto.customerPhone)!; // đã kiểm tra ở DTO
    const chosen = chooseReferral({
      inputCode: dto.referralCode,
      cookie: dto.cookie ? { ...dto.cookie, channelCode: dto.cookie.channelCode ?? null } : null,
      now: orderedAt,
      cookieDays: await this.settings.cookieDays(),
    });
    const affiliate = chosen ? await this.findByCode(chosen.code) : null;
    const decision = decideAttribution({ affiliate: affiliate ? toSnapshot(affiliate) : null, customerPhone, orderedAt });

    const link = affiliate && decision.affiliateId ? await this.linkFor(affiliate.id, chosen?.channelCode ?? null) : null;
    return {
      affiliateId: decision.affiliateId,
      linkId: link?.id ?? null,
      channelCode: decision.affiliateId ? (chosen?.channelCode ?? null) : null,
      /** Mã khách đã dùng, giữ lại cả khi không được tính (vd hợp đồng hết hạn) để tra cứu sau. */
      referralCodeUsed: chosen?.code ?? null,
      attributionSource: decision.affiliateId ? (chosen?.source ?? null) : null,
      isSelfPurchase: decision.isSelfPurchase,
      commissionEligible: decision.commissionEligible,
      commissionRateBps: decision.rateBps,
      reason: decision.reason,
    };
  }
}
