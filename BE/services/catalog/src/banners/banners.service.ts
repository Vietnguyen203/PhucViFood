import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { BannerSlotCodec } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Banner } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBannerDto, UpdateBannerDto } from './dto';

export const BANNERS_SERVICE = Symbol('BANNERS_SERVICE');

export const toBannerView = (b: Banner) => ({
  id: b.id, title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl, slot: BannerSlotCodec.toName(b.slot),
  sortOrder: b.sortOrder, isActive: b.isActive, startsAt: b.startsAt, endsAt: b.endsAt, createdAt: b.createdAt,
});

const toDate = (v: string | null | undefined): Date | null | undefined => (v === undefined ? undefined : v === null || v === '' ? null : new Date(v));

function assertSchedule(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw AppException.validation([{ field: 'endsAt', messages: ['endsAt phải sau startsAt'] }]);
  }
}

/** Admin quản lý banner trang chủ. Xóa là xóa hẳn (banner không có dữ liệu khác tham chiếu). */
@Injectable()
export class BannersService extends PrismaCrudService<Banner, CreateBannerDto, UpdateBannerDto> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super(prisma.banner, {
      label: 'Banner',
      sortableFields: ['sortOrder', 'createdAt', 'title'],
      defaultSort: 'sortOrder',
      filterableFields: { slot: { codec: BannerSlotCodec }, isActive: 'boolean' },
      searchableFields: ['title'],
    });
  }

  protected override toResponse(b: Banner) {
    return toBannerView(b);
  }

  override async create(dto: CreateBannerDto) {
    const startsAt = toDate(dto.startsAt);
    const endsAt = toDate(dto.endsAt);
    assertSchedule(startsAt, endsAt);
    return toBannerView(await this.prisma.banner.create({
      data: {
        title: dto.title, imageUrl: dto.imageUrl, linkUrl: dto.linkUrl || null, slot: BannerSlotCodec.toCode(dto.slot),
        sortOrder: dto.sortOrder ?? 0, isActive: dto.isActive ?? true, startsAt: startsAt ?? null, endsAt: endsAt ?? null,
      },
    }));
  }

  override async update(id: string, dto: UpdateBannerDto) {
    const current = await this.findOrThrow(id);
    const startsAt = toDate(dto.startsAt);
    const endsAt = toDate(dto.endsAt);
    assertSchedule(startsAt === undefined ? current.startsAt : startsAt, endsAt === undefined ? current.endsAt : endsAt);
    return toBannerView(await this.prisma.banner.update({
      where: { id },
      data: {
        title: dto.title, imageUrl: dto.imageUrl, slot: dto.slot ? BannerSlotCodec.toCode(dto.slot) : undefined,
        linkUrl: dto.linkUrl === undefined ? undefined : dto.linkUrl || null,
        sortOrder: dto.sortOrder, isActive: dto.isActive, startsAt, endsAt,
      },
    }));
  }

  /** Banner khách thấy: đang bật và trong khoảng lịch. Cùng vị trí xếp theo thứ tự rồi mới tạo trước. */
  async listPublic(now = new Date()) {
    const rows = await this.prisma.banner.findMany({
      where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const pick = (slot: 'MAIN' | 'SIDE') => rows.filter((b) => BannerSlotCodec.toName(b.slot) === slot).map((b) => ({ id: b.id, title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl }));
    return { main: pick('MAIN'), side: pick('SIDE') };
  }
}
