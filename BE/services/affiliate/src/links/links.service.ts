import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import type { AffiliateLink } from '../../generated/client';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLinkDto, UpdateLinkDto } from './dto';

const toView = (l: AffiliateLink, referralCode: string) => ({
  id: l.id,
  channelCode: l.channelCode,
  label: l.label,
  isActive: l.isActive,
  /** Đường dẫn chia sẻ ở web: /r/{mã}?c={kênh}. FE ghép với tên miền. */
  path: `/r/${referralCode}?c=${l.channelCode}`,
  createdAt: l.createdAt,
});

/** Link theo kênh của CTV (facebook, tiktok, zalo...). Mỗi CTV một link cho mỗi kênh. */
@Injectable()
export class LinksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AffiliatesService) private readonly affiliates: AffiliatesService,
  ) {}

  async list(userId: string) {
    const me = await this.affiliates.getMineOrThrow(userId);
    const links = await this.prisma.affiliateLink.findMany({ where: { affiliateId: me.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return links.map((l) => toView(l, me.referralCode));
  }

  async create(userId: string, dto: CreateLinkDto) {
    const me = await this.affiliates.getMineOrThrow(userId);
    try {
      const link = await this.prisma.affiliateLink.create({ data: { affiliateId: me.id, channelCode: dto.channelCode, label: dto.label } });
      return toView(link, me.referralCode);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw AppException.conflict('Bạn đã có link cho kênh này');
      throw e;
    }
  }

  async update(userId: string, id: string, dto: UpdateLinkDto) {
    const me = await this.affiliates.getMineOrThrow(userId);
    // Điều kiện affiliateId bảo đảm CTV chỉ sửa được link của chính mình.
    const claimed = await this.prisma.affiliateLink.updateMany({ where: { id, affiliateId: me.id }, data: { label: dto.label, isActive: dto.isActive } });
    if (claimed.count === 0) throw AppException.notFound('Link không tồn tại');
    return toView(await this.prisma.affiliateLink.findUniqueOrThrow({ where: { id } }), me.referralCode);
  }
}
