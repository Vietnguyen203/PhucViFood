import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { TrackingEventTypeCodec, type TrackingEventTypeCode } from '@phucvi/shared-library/contracts';
import { DownstreamError } from '@phucvi/shared-library/http';
import { normalizeChannelCode, normalizeReferralCode, uuidv7 } from '@phucvi/shared-library/utils';
import { AffiliateClient } from '../clients/affiliate.client';
import { PrismaService } from '../prisma/prisma.service';
import type { ClickDto, TrackEventDto } from './dto';

const DAY_MS = 86_400_000;

/** Đọc ?from=&to= (ISO). Mặc định 30 ngày gần nhất; `to` không gồm mốc cuối. */
export function parseRange(query: Record<string, unknown>, now = new Date()): { from: Date; to: Date } {
  const parse = (raw: unknown, name: string, fallback: Date): Date => {
    if (raw === undefined || raw === '') return fallback;
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) throw AppException.validation([{ field: name, messages: [`${name} phải là ngày hợp lệ (ISO 8601)`] }]);
    return d;
  };
  const to = parse(query.to, 'to', now);
  const from = parse(query.from, 'from', new Date(to.getTime() - 30 * DAY_MS));
  if (from >= to) throw AppException.validation([{ field: 'from', messages: ['from phải trước to'] }]);
  if (to.getTime() - from.getTime() > 366 * DAY_MS) throw AppException.validation([{ field: 'to', messages: ['khoảng thống kê tối đa 366 ngày'] }]);
  return { from, to };
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AffiliateClient) private readonly affiliate: AffiliateClient,
  ) {}

  /**
   * Ghi nhận một lượt bấm link. Chỉ ghi khi mã thuộc CTV còn hiệu lực (affiliate xác nhận). Trả về nội dung cookie
   * để web lưu (mỗi lần bấm ghi đè cookie cũ: link bấm sau cùng thắng). Affiliate không trả lời thì 503: không có
   * xác nhận mã thì không cấp được cookie.
   */
  async recordClick(dto: ClickDto, userAgent: string | undefined) {
    const code = normalizeReferralCode(dto.code);
    const channelCode = normalizeChannelCode(dto.channel);
    if (!code) return { valid: false as const };

    let ctx;
    try {
      ctx = await this.affiliate.referralContext(code, channelCode);
    } catch (e) {
      if (e instanceof DownstreamError) throw AppException.unavailable('Chưa ghi nhận được liên kết giới thiệu, vui lòng thử lại');
      throw e;
    }
    if (!ctx.valid) return { valid: false as const };

    const visitorId = dto.visitorId ?? uuidv7();
    await this.prisma.referralClick.create({
      data: { affiliateId: ctx.affiliateId, linkId: ctx.linkId, channelCode, visitorId, landingPath: dto.landingPath, userAgent: userAgent?.slice(0, 255) },
    });
    return {
      valid: true as const,
      visitorId,
      cookie: { code: ctx.referralCode, channelCode, clickedAt: new Date().toISOString(), maxAgeDays: ctx.cookieDays },
    };
  }

  /**
   * Ghi một tương tác (xem sản phẩm, thêm giỏ...). Chỉ để thống kê, không trả tiền, nên KHÔNG làm hỏng trải nghiệm mua hàng:
   * mã không hợp lệ hoặc affiliate không trả lời thì bỏ qua (`recorded:false`).
   */
  async recordEvent(dto: TrackEventDto): Promise<{ recorded: boolean }> {
    const code = normalizeReferralCode(dto.code);
    if (!code) return { recorded: false };
    const channelCode = normalizeChannelCode(dto.channel);
    try {
      const ctx = await this.affiliate.referralContext(code, channelCode);
      if (!ctx.valid) return { recorded: false };
      await this.prisma.trackingEvent.create({
        data: {
          affiliateId: ctx.affiliateId, visitorId: dto.visitorId, channelCode,
          type: TrackingEventTypeCodec.toCode(dto.type as keyof typeof TrackingEventTypeCode), productId: dto.productId ?? null,
        },
      });
      return { recorded: true };
    } catch (e) {
      if (!(e instanceof DownstreamError)) throw e;
      this.logger.warn(`Bỏ qua sự kiện ${dto.type}: không xác nhận được mã với affiliate (${e.reason ?? e.status})`);
      return { recorded: false };
    }
  }

  /** Thống kê tương tác của CTV đang đăng nhập: lượt bấm, người xem duy nhất, sự kiện theo kênh. */
  async statsFor(userId: string, query: Record<string, unknown>) {
    const { from, to } = parseRange(query);
    let me;
    try {
      me = await this.affiliate.byUser(userId);
    } catch (e) {
      if (e instanceof DownstreamError) throw AppException.unavailable('Chưa lấy được thống kê, vui lòng thử lại');
      throw e;
    }
    if (!me) throw AppException.notFound('Bạn chưa đăng ký hồ sơ cộng tác viên');

    const clicks = await this.prisma.$queryRawUnsafe<Array<{ channel_code: string | null; clicks: bigint; visitors: bigint }>>(
      `SELECT channel_code, count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
         FROM tracking.referral_clicks
        WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3
        GROUP BY channel_code ORDER BY clicks DESC, channel_code`,
      me.affiliateId, from, to,
    );
    const events = await this.prisma.$queryRawUnsafe<Array<{ channel_code: string | null; type: number; count: bigint }>>(
      `SELECT channel_code, type, count(*) AS count
         FROM tracking.tracking_events
        WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3
        GROUP BY channel_code, type ORDER BY type, channel_code`,
      me.affiliateId, from, to,
    );
    const total = await this.prisma.$queryRawUnsafe<Array<{ clicks: bigint; visitors: bigint }>>(
      `SELECT count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
         FROM tracking.referral_clicks WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3`,
      me.affiliateId, from, to,
    );

    return {
      range: { from, to },
      clicks: {
        total: Number(total[0]?.clicks ?? 0),
        uniqueVisitors: Number(total[0]?.visitors ?? 0),
        byChannel: clicks.map((r) => ({ channelCode: r.channel_code, clicks: Number(r.clicks), visitors: Number(r.visitors) })),
      },
      events: events.map((r) => ({ channelCode: r.channel_code, type: TrackingEventTypeCodec.toName(r.type), count: Number(r.count) })),
    };
  }
}
