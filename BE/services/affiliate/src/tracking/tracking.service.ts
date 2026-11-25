import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { normalizeChannelCode } from '@phucvi/shared-library/utils';
import { TrackingEventTypeCodec, type TrackingEventTypeCode } from '@phucvi/shared-library/contracts';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService } from '../referral/referral.service';
import type { TrackEventDto } from '../referral/dto';

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReferralService) private readonly referral: ReferralService,
    @Inject(AffiliatesService) private readonly affiliates: AffiliatesService,
  ) {}

  /** Ghi một tương tác (xem sản phẩm, thêm giỏ...). Chỉ để thống kê, không trả tiền. Mã không hợp lệ thì bỏ qua. */
  async recordEvent(dto: TrackEventDto): Promise<{ recorded: boolean }> {
    const affiliate = await this.referral.findActiveByCode(dto.code);
    if (!affiliate) return { recorded: false };
    await this.prisma.trackingEvent.create({
      data: {
        affiliateId: affiliate.id, visitorId: dto.visitorId, channelCode: normalizeChannelCode(dto.channel),
        type: TrackingEventTypeCodec.toCode(dto.type as keyof typeof TrackingEventTypeCode), productId: dto.productId ?? null,
      },
    });
    return { recorded: true };
  }

  /** Thống kê tương tác của CTV đang đăng nhập: lượt bấm, người xem duy nhất, sự kiện theo kênh. */
  async statsFor(userId: string, query: Record<string, unknown>) {
    const me = await this.affiliates.getMineOrThrow(userId);
    const { from, to } = parseRange(query);

    const clicks = await this.prisma.$queryRawUnsafe<Array<{ channel_code: string | null; clicks: bigint; visitors: bigint }>>(
      `SELECT channel_code, count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
         FROM tracking.referral_clicks
        WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3
        GROUP BY channel_code ORDER BY clicks DESC, channel_code`,
      me.id, from, to,
    );
    const events = await this.prisma.$queryRawUnsafe<Array<{ channel_code: string | null; type: number; count: bigint }>>(
      `SELECT channel_code, type, count(*) AS count
         FROM tracking.tracking_events
        WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3
        GROUP BY channel_code, type ORDER BY type, channel_code`,
      me.id, from, to,
    );
    const total = await this.prisma.$queryRawUnsafe<Array<{ clicks: bigint; visitors: bigint }>>(
      `SELECT count(*) AS clicks, count(DISTINCT visitor_id) AS visitors
         FROM tracking.referral_clicks WHERE affiliate_id = $1::uuid AND created_at >= $2 AND created_at < $3`,
      me.id, from, to,
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
