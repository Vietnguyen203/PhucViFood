import { Inject, Injectable } from '@nestjs/common';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import ExcelJS from 'exceljs';
import type { ExportLog } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';
import type { CustomerWithClass } from './view';

export const EXPORT_LOGS_SERVICE = Symbol('EXPORT_LOGS_SERVICE');
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Ô bắt đầu bằng = + - @ (hoặc tab, xuống dòng) có thể bị Excel hiểu là công thức khi người dùng sửa ô.
 * Thêm dấu nháy đơn phía trước để luôn là chữ. Không áp cho SĐT (+84...) vì đó là dữ liệu hợp lệ.
 */
export function safeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Giờ Việt Nam dạng "2026-11-25 14:30" (UTC+7 quanh năm). */
export const fmtVn = (d: Date | null | undefined): string =>
  d ? new Date(d.getTime() + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 16) : '';

const TIER_VI = { NEW: 'Mới', RETURNING: 'Quen', VIP: 'VIP' } as const;
const ACTIVITY_VI = { NONE: 'Chưa có đơn', ACTIVE: 'Hoạt động', AT_RISK: 'Sắp rời', CHURNED: 'Đã rời' } as const;

export async function buildWorkbook(rows: CustomerWithClass[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Phúc Vị Foods';
  const ws = wb.addWorksheet('Khách hàng');
  ws.columns = [
    { header: 'Họ tên', key: 'fullName', width: 28 },
    { header: 'Số điện thoại', key: 'phone', width: 16, style: { numFmt: '@' } },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Tỉnh/Thành', key: 'province', width: 22 },
    { header: 'Phường/Xã', key: 'ward', width: 22 },
    { header: 'Địa chỉ', key: 'addressLine', width: 36 },
    { header: 'Nguồn đầu tiên (mã CTV)', key: 'firstAffiliateId', width: 38 },
    { header: 'Kênh đầu tiên', key: 'firstChannelCode', width: 14 },
    { header: 'Đồng ý nhận tư vấn', key: 'consent', width: 18 },
    { header: 'Ngày đồng ý', key: 'consentAt', width: 18 },
    { header: 'Số đơn hợp lệ', key: 'validOrders', width: 14 },
    { header: 'Tổng chi (VND)', key: 'totalSpent', width: 16, style: { numFmt: '#,##0' } },
    { header: 'Đơn gần nhất', key: 'lastOrderAt', width: 18 },
    { header: 'Phân loại', key: 'tier', width: 12 },
    { header: 'Hoạt động', key: 'activity', width: 14 },
    { header: 'Ngày tạo', key: 'createdAt', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const c of rows) {
    ws.addRow({
      fullName: safeCell(c.fullName), phone: c.phone, email: safeCell(c.email), province: safeCell(c.province), ward: safeCell(c.ward),
      addressLine: safeCell(c.addressLine), firstAffiliateId: c.firstSource.affiliateId ?? '', firstChannelCode: safeCell(c.firstSource.channelCode),
      consent: c.marketingConsent ? 'Có' : 'Không', consentAt: fmtVn(c.consentAt),
      validOrders: c.orders?.validOrders ?? '', totalSpent: c.orders?.totalSpent ?? '', lastOrderAt: fmtVn(c.orders?.lastOrderAt),
      tier: c.tier ? TIER_VI[c.tier] : '', activity: c.activity ? ACTIVITY_VI[c.activity] : '', createdAt: fmtVn(c.createdAt),
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Xuất danh sách khách ra Excel. MỖI lần xuất đều ghi nhật ký (ai xuất, bộ lọc, số dòng) vào customer.export_logs. */
@Injectable()
export class ExportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}

  async export(query: Record<string, unknown>, adminId: string) {
    const { rows, statsAvailable } = await this.customers.all(query);
    const buffer = await buildWorkbook(rows);
    const { page: _p, pageSize: _s, ...filters } = query;
    await this.prisma.exportLog.create({ data: { exportedBy: adminId, filters: filters as object, rowCount: rows.length, format: 'xlsx' } });
    const stamp = fmtVn(new Date()).replace(/[-: ]/g, '').slice(0, 12);
    return { buffer, rowCount: rows.length, statsAvailable, fileName: `khach-hang-${stamp}.xlsx` };
  }
}

export const toExportLogView = (l: ExportLog) => ({
  id: l.id, exportedBy: l.exportedBy, filters: l.filters, rowCount: l.rowCount, format: l.format, createdAt: l.createdAt,
});

/** Admin xem nhật ký xuất dữ liệu. */
@Injectable()
export class ExportLogsService extends PrismaCrudService<ExportLog> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma.exportLog, {
      label: 'Nhật ký xuất',
      sortableFields: ['createdAt', 'rowCount'],
      defaultSort: '-createdAt',
      filterableFields: { exportedBy: 'uuid', createdAt: 'date' },
    });
  }

  protected override toResponse(l: ExportLog) {
    return toExportLogView(l);
  }
}
