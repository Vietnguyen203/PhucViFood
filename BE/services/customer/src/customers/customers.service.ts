import { Inject, Injectable } from '@nestjs/common';
import { AppException, PageResult } from '@phucvi/shared-library/api';
import { parseListQuery, type ListConfig } from '@phucvi/shared-library/crud';
import { normalizeVnPhone, type CustomerActivity, type CustomerOrderStats, type CustomerTier } from '@phucvi/shared-library/utils';
import type { Customer, Prisma } from '../../generated/client';
import { OrderingClient, statsUnavailable } from '../clients/ordering.client';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentSettingsService } from '../settings/segment-settings.service';
import type { UpdateCustomerDto, UpsertCustomerDto } from './dto';
import { buildCreate, buildUpdate } from './upsert';
import { EMPTY_STATS, toCustomerView, withClassification, type CustomerWithClass } from './view';

const TIERS: readonly CustomerTier[] = ['NEW', 'RETURNING', 'VIP'];
const ACTIVITIES: readonly CustomerActivity[] = ['NONE', 'ACTIVE', 'AT_RISK', 'CHURNED'];
/** Sắp xếp theo thống kê đơn (không nằm trong DB của customer) nên phải xử lý trong bộ nhớ. */
const STAT_SORTS = ['totalSpent', 'validOrders', 'lastOrderAt'] as const;
type StatSort = (typeof STAT_SORTS)[number];

/** Giới hạn số khách xử lý trong bộ nhớ khi lọc hoặc sắp xếp theo phân loại, và khi xuất Excel. */
export const MAX_IN_MEMORY = 10_000;

const LIST_CONFIG: ListConfig = {
  sortableFields: ['createdAt', 'fullName', 'province'],
  defaultSort: '-createdAt',
  filterableFields: { province: 'string', firstAffiliateId: 'uuid', firstChannelCode: 'string', marketingConsent: 'boolean', createdAt: 'date' },
};

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

/** Điều kiện tìm kiếm ?q=: SĐT viết kiểu nào (0912..., +84912..., một phần) cũng khớp; ngoài ra khớp tên và email. */
export function searchWhere(q: unknown): Prisma.CustomerWhereInput | undefined {
  const text = typeof q === 'string' ? q.trim() : '';
  if (!text) return undefined;
  const or: Prisma.CustomerWhereInput[] = [
    { fullName: { contains: text, mode: 'insensitive' } },
    { email: { contains: text, mode: 'insensitive' } },
  ];
  const full = normalizeVnPhone(text);
  if (full) or.push({ phone: full });
  else if (/^[+\d\s.()-]{3,}$/.test(text)) {
    const digits = text.replace(/\D/g, '').replace(/^0/, ''); // 0912... -> 912..., khớp phần sau +84
    if (digits) or.push({ phone: { contains: digits } });
  }
  return { OR: or };
}

export interface ListParams {
  where: Prisma.CustomerWhereInput;
  orderBy: Array<Record<string, 'asc' | 'desc'>>;
  page: number; pageSize: number; skip: number; take: number;
  tier?: CustomerTier;
  activity?: CustomerActivity;
  statSort?: { field: StatSort; dir: 'asc' | 'desc' };
}

/** Đọc và kiểm tra tham số danh sách: bộ lọc DB, ?q=, ?tier=, ?activity=, và sắp xếp theo thống kê. */
export function parseCustomerQuery(query: Record<string, unknown>): ListParams {
  const { tier, activity, ...rest } = query;
  const issues: Array<{ field: string; messages: string[] }> = [];
  if (tier !== undefined && !TIERS.includes(tier as CustomerTier)) issues.push({ field: 'tier', messages: [`tier thuộc: ${TIERS.join(', ')}`] });
  if (activity !== undefined && !ACTIVITIES.includes(activity as CustomerActivity)) issues.push({ field: 'activity', messages: [`activity thuộc: ${ACTIVITIES.join(', ')}`] });

  let statSort: ListParams['statSort'];
  if (typeof rest.sort === 'string') {
    const token = rest.sort.split(',')[0];
    const field = token.replace(/^-/, '');
    if ((STAT_SORTS as readonly string[]).includes(field)) {
      statSort = { field: field as StatSort, dir: token.startsWith('-') ? 'desc' : 'asc' };
      delete rest.sort; // phần còn lại do parseListQuery xử lý với sắp xếp mặc định
    }
  }
  if (issues.length) throw AppException.validation(issues);

  const args = parseListQuery(rest, { ...LIST_CONFIG, baseWhere: searchWhere(rest.q) });
  return {
    where: args.where as Prisma.CustomerWhereInput, orderBy: args.orderBy as ListParams['orderBy'],
    page: args.page, pageSize: args.pageSize, skip: args.skip, take: args.take,
    tier: tier as CustomerTier | undefined, activity: activity as CustomerActivity | undefined, statSort,
  };
}

@Injectable()
export class CustomersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrderingClient) private readonly ordering: OrderingClient,
    @Inject(SegmentSettingsService) private readonly settings: SegmentSettingsService,
  ) {}

  // ───────── Ordering gọi: tìm hoặc tạo khách ─────────

  /**
   * Tìm hoặc tạo khách theo SĐT chuẩn hóa. An toàn khi gọi song song: hai yêu cầu cùng tạo một SĐT mới thì
   * một bên tạo, bên kia thua ở unique và chuyển sang nhánh cập nhật.
   */
  async upsert(dto: UpsertCustomerDto): Promise<{ id: string; phone: string; isNew: boolean }> {
    const phone = normalizeVnPhone(dto.phone)!; // đã kiểm tra ở DTO
    const now = new Date();
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (!existing) {
      try {
        const created = await this.prisma.customer.create({ data: buildCreate(phone, dto, now) });
        return { id: created.id, phone, isNew: true };
      } catch (e) {
        if (!isUnique(e)) throw e;
      }
    }
    const current = existing ?? (await this.prisma.customer.findUniqueOrThrow({ where: { phone } }));
    const updated = await this.prisma.customer.update({ where: { id: current.id }, data: buildUpdate(current, dto, now) });
    return { id: updated.id, phone, isNew: false };
  }

  // ───────── Admin ─────────

  private async byId(id: string): Promise<Customer> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw AppException.validation([{ field: 'id', messages: ['id phải là UUID'] }]);
    }
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw AppException.notFound('Khách hàng không tồn tại');
    return c;
  }

  /** Chi tiết khách: thông tin, phân loại, và các đơn gần nhất. Ordering lỗi thì vẫn trả thông tin khách. */
  async detail(id: string) {
    const c = await this.byId(id);
    const thresholds = await this.settings.thresholds();
    const [stats, recent] = await Promise.all([
      this.ordering.orderStats([id]).then((m) => m.get(id) ?? EMPTY_STATS).catch(() => null),
      this.ordering.recentOrders(id, 10).catch(() => null),
    ]);
    return { ...withClassification(c, stats, thresholds), recentOrders: recent };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.byId(id);
    return toCustomerView(await this.prisma.customer.update({
      where: { id }, data: { fullName: dto.fullName, email: dto.email, province: dto.province, ward: dto.ward, addressLine: dto.addressLine },
    }));
  }

  /**
   * Admin ghi nhận khách đồng ý hoặc rút lại đồng ý nhận tư vấn. Rút lại giữ nguyên `consentAt` (bằng chứng lần đồng ý
   * trước) và ghi `consentWithdrawnAt`. Làm lại thao tác cùng trạng thái không đổi gì.
   */
  async setConsent(id: string, consent: boolean) {
    const c = await this.byId(id);
    if (consent === c.marketingConsent) return toCustomerView(c);
    const data: Prisma.CustomerUpdateInput = consent
      ? { marketingConsent: true, consentAt: new Date(), consentWithdrawnAt: null }
      : { marketingConsent: false, consentWithdrawnAt: new Date() };
    return toCustomerView(await this.prisma.customer.update({ where: { id }, data }));
  }

  // ───────── Danh sách và phân loại tính khi truy vấn ─────────

  async list(query: Record<string, unknown>): Promise<PageResult<CustomerWithClass>> {
    const p = parseCustomerQuery(query);
    const thresholds = await this.settings.thresholds();

    if (!p.tier && !p.activity && !p.statSort) {
      // Đường nhanh: phân trang ở DB, chỉ lấy thống kê của các khách trong trang.
      const [rows, total] = await Promise.all([
        this.prisma.customer.findMany({ where: p.where, orderBy: p.orderBy, skip: p.skip, take: p.take }),
        this.prisma.customer.count({ where: p.where }),
      ]);
      const stats = await this.ordering.orderStats(rows.map((r) => r.id)).catch(() => null);
      return new PageResult(rows.map((r) => withClassification(r, stats ? (stats.get(r.id) ?? EMPTY_STATS) : null, thresholds)), total, p.page, p.pageSize);
    }

    // Lọc hoặc sắp xếp theo thống kê: cần thống kê của mọi khách khớp bộ lọc DB nên xử lý trong bộ nhớ.
    const all = await this.collect(p, thresholds, true);
    const filtered = all.filter((c) => (!p.tier || c.tier === p.tier) && (!p.activity || c.activity === p.activity));
    if (p.statSort) this.sortByStat(filtered, p.statSort);
    return new PageResult(filtered.slice(p.skip, p.skip + p.take), filtered.length, p.page, p.pageSize);
  }

  /**
   * Toàn bộ khách khớp mọi bộ lọc (kể cả tier, activity) và đã sắp xếp, không phân trang. Dùng cho xuất Excel.
   * Không lọc theo phân loại thì ordering lỗi vẫn xuất được (cột thống kê để trống, `statsAvailable = false`).
   */
  async all(query: Record<string, unknown>): Promise<{ rows: CustomerWithClass[]; statsAvailable: boolean }> {
    const p = parseCustomerQuery(query);
    const needsStats = Boolean(p.tier || p.activity || p.statSort);
    const rows = (await this.collect(p, await this.settings.thresholds(), needsStats))
      .filter((c) => (!p.tier || c.tier === p.tier) && (!p.activity || c.activity === p.activity));
    if (p.statSort) this.sortByStat(rows, p.statSort);
    return { rows, statsAvailable: rows.length === 0 || rows[0].statsAvailable };
  }

  /** Toàn bộ khách khớp bộ lọc (tối đa MAX_IN_MEMORY), kèm phân loại. Dùng cho lọc theo phân loại và xuất Excel. */
  async collect(p: ListParams, thresholds: Awaited<ReturnType<SegmentSettingsService['thresholds']>>, statsRequired: boolean): Promise<CustomerWithClass[]> {
    const rows = await this.prisma.customer.findMany({ where: p.where, orderBy: p.orderBy, take: MAX_IN_MEMORY + 1 });
    if (rows.length > MAX_IN_MEMORY) {
      throw AppException.businessRule(`Bộ lọc khớp quá ${MAX_IN_MEMORY} khách, hãy thu hẹp điều kiện lọc`);
    }
    let stats: Map<string, CustomerOrderStats> | null = null;
    try {
      stats = await this.ordering.orderStats(rows.map((r) => r.id));
    } catch {
      if (statsRequired) throw statsUnavailable(); // lọc theo phân loại thì không thể trả kết quả sai
    }
    return rows.map((r) => withClassification(r, stats ? (stats.get(r.id) ?? EMPTY_STATS) : null, thresholds));
  }

  private sortByStat(rows: CustomerWithClass[], s: NonNullable<ListParams['statSort']>): void {
    const value = (c: CustomerWithClass): number | null => {
      if (!c.orders) return null;
      return s.field === 'lastOrderAt' ? (c.orders.lastOrderAt ? c.orders.lastOrderAt.getTime() : null) : c.orders[s.field];
    };
    const sign = s.dir === 'asc' ? 1 : -1;
    // Giá trị null (không có thống kê, hoặc chưa có "đơn gần nhất") luôn xếp cuối, bất kể chiều sắp xếp.
    // Khách chưa có đơn có tổng chi và số đơn là 0 nên xếp theo 0 như mọi giá trị khác.
    rows.sort((a, b) => {
      const [x, y] = [value(a), value(b)];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x - y) * sign;
    });
  }
}
