import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/app-config';
import { UpdateCustomerDto, UpsertCustomerDto } from '../../src/customers/dto';
import { parseCustomerQuery, searchWhere } from '../../src/customers/customers.service';
import { buildWorkbook, fmtVn, safeCell } from '../../src/customers/export.service';
import { buildCreate, buildUpdate } from '../../src/customers/upsert';
import { withClassification } from '../../src/customers/view';
import type { Customer } from '../../generated/client';

const env = { CUSTOMER_DATABASE_URL: 'postgresql://x', RABBITMQ_URL: 'amqp://x', JWT_ACCESS_SECRET: 'a'.repeat(32), INTERNAL_API_KEY: 'k'.repeat(24) };

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ với giá trị mặc định', () => {
    expect(loadConfig(env)).toMatchObject({ port: 3005, orderingUrl: 'http://localhost:3004/api', downstreamTimeoutMs: 5000, relayEnabled: true });
  });
  it('báo tất cả lỗi một lượt', () => {
    expect(() => loadConfig({ INTERNAL_API_KEY: 'x', ORDERING_URL: 'khong-phai-url', PORT: '0' })).toThrowError(
      /CUSTOMER_DATABASE_URL[\s\S]*RABBITMQ_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*INTERNAL_API_KEY[\s\S]*PORT[\s\S]*ORDERING_URL/,
    );
  });
});

const now = new Date('2026-11-25T03:00:00Z');
const input = { fullName: 'Nguyễn Thị Linh', province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông' };

describe('upsert: khách mới', () => {
  it('lưu nguồn đầu tiên; tick đồng ý thì ghi thời điểm đồng ý', () => {
    expect(buildCreate('+84912345678', { ...input, marketingConsent: true, firstAffiliateId: 'a1', firstChannelCode: 'facebook' }, now)).toMatchObject({
      phone: '+84912345678', firstAffiliateId: 'a1', firstChannelCode: 'facebook', marketingConsent: true, consentAt: now,
    });
  });
  it('không tick thì không có thời điểm đồng ý; không nguồn thì null', () => {
    expect(buildCreate('+84912345678', input, now)).toMatchObject({ marketingConsent: false, consentAt: null, firstAffiliateId: null, firstChannelCode: null });
  });
});

describe('upsert: khách đã có', () => {
  it('cập nhật tên và địa chỉ theo đơn mới nhất; KHÔNG bao giờ đổi nguồn đầu tiên', () => {
    const data = buildUpdate({ marketingConsent: false }, { ...input, fullName: 'Linh Nguyễn', addressLine: '5 Duy Tân', firstAffiliateId: 'khac', firstChannelCode: 'tiktok' }, now);
    expect(data).toMatchObject({ fullName: 'Linh Nguyễn', addressLine: '5 Duy Tân' });
    expect(data).not.toHaveProperty('firstAffiliateId');
    expect(data).not.toHaveProperty('firstChannelCode');
  });

  it('chỉ ghi đè trường có gửi (không xóa email cũ khi đơn mới không có email)', () => {
    const data = buildUpdate({ marketingConsent: false }, { fullName: 'A B' }, now);
    expect(Object.keys(data)).toEqual(['fullName']);
  });

  it('tick đồng ý lần đầu thì bật và ghi thời điểm; đã đồng ý thì giữ nguyên thời điểm cũ', () => {
    expect(buildUpdate({ marketingConsent: false }, { ...input, marketingConsent: true }, now)).toMatchObject({
      marketingConsent: true, consentAt: now, consentWithdrawnAt: null,
    });
    expect(buildUpdate({ marketingConsent: true }, { ...input, marketingConsent: true }, now)).not.toHaveProperty('consentAt');
  });

  it('không tick (false hoặc bỏ trống) KHÔNG rút lại đồng ý đã có', () => {
    for (const marketingConsent of [false, undefined]) {
      const data = buildUpdate({ marketingConsent: true }, { ...input, marketingConsent }, now);
      expect(data).not.toHaveProperty('marketingConsent');
      expect(data).not.toHaveProperty('consentWithdrawnAt');
    }
  });
});

describe('searchWhere (?q=)', () => {
  it('rỗng thì không điều kiện', () => {
    expect(searchWhere(undefined)).toBeUndefined();
    expect(searchWhere('   ')).toBeUndefined();
  });
  it('SĐT đầy đủ ở mọi dạng viết đều tra đúng số chuẩn hóa', () => {
    for (const q of ['0912345678', '+84 912 345 678', '84912345678']) {
      expect(JSON.stringify(searchWhere(q))).toContain('"phone":"+84912345678"');
    }
  });
  it('một phần SĐT khớp phần sau +84 (bỏ số 0 đầu)', () => {
    expect(JSON.stringify(searchWhere('0912'))).toContain('"phone":{"contains":"912"}');
  });
  it('chữ thường thì tìm theo tên và email, không tìm SĐT', () => {
    const where = JSON.stringify(searchWhere('linh'));
    expect(where).toContain('fullName');
    expect(where).toContain('email');
    expect(where).not.toContain('"phone"');
  });
});

describe('parseCustomerQuery', () => {
  it('mặc định: trang 1, 20 dòng, mới nhất trước, không lọc phân loại', () => {
    const p = parseCustomerQuery({});
    expect(p).toMatchObject({ page: 1, pageSize: 20, tier: undefined, activity: undefined, statSort: undefined });
    expect(p.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });
  it('nhận tier, activity, bộ lọc DB (cả khóa ngoặc phẳng) và sắp xếp theo thống kê', () => {
    const p = parseCustomerQuery({ tier: 'VIP', activity: 'ACTIVE', 'filter[marketingConsent]': 'true', sort: '-totalSpent' });
    expect(p.tier).toBe('VIP');
    expect(p.activity).toBe('ACTIVE');
    expect(p.statSort).toEqual({ field: 'totalSpent', dir: 'desc' });
    expect(JSON.stringify(p.where)).toContain('"marketingConsent":true');
  });
  it.each([
    ['tier lạ', { tier: 'GOLD' }],
    ['activity lạ', { activity: 'SLEEPING' }],
    ['sắp xếp theo trường không cho phép', { sort: 'phone' }],
    ['lọc theo trường không cho phép', { filter: { phone: '+84912345678' } }],
    ['lọc theo mã số', { filter: { marketingConsent: 'maybe' } }],
  ])('từ chối: %s', (_n, q) => {
    expect(() => parseCustomerQuery(q as Record<string, unknown>)).toThrow();
  });
});

describe('DTO', () => {
  const errors = async (Cls: new () => object, plain: object) => (await validate(plainToInstance(Cls, plain), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property).sort();

  it('upsert hợp lệ, cho phép nguồn đầu tiên là null', async () => {
    expect(await errors(UpsertCustomerDto, { phone: '0912 345 678', fullName: 'Nguyễn A', marketingConsent: true })).toEqual([]);
    expect(await errors(UpsertCustomerDto, { phone: '+84912345678', fullName: 'Nguyễn A', firstAffiliateId: null, firstChannelCode: null })).toEqual([]);
  });
  it.each([
    ['SĐT sai', { phone: '123', fullName: 'Nguyễn A' }, 'phone'],
    ['thiếu tên', { phone: '0912345678' }, 'fullName'],
    ['email sai', { phone: '0912345678', fullName: 'Nguyễn A', email: 'khong' }, 'email'],
    ['firstAffiliateId không phải UUID', { phone: '0912345678', fullName: 'Nguyễn A', firstAffiliateId: 'x' }, 'firstAffiliateId'],
    ['trường lạ', { phone: '0912345678', fullName: 'Nguyễn A', role: 'ADMIN' }, 'role'],
  ])('upsert từ chối: %s', async (_n, plain, field) => {
    expect(await errors(UpsertCustomerDto, plain)).toContain(field);
  });
  it('admin sửa khách không đổi được SĐT, nguồn đầu tiên hay đồng ý', async () => {
    expect(await errors(UpdateCustomerDto, { fullName: 'Tên mới' })).toEqual([]);
    for (const f of ['phone', 'firstAffiliateId', 'firstChannelCode', 'marketingConsent']) expect(await errors(UpdateCustomerDto, { [f]: 'x' })).toContain(f);
  });
});

describe('xuất Excel', () => {
  it('chống công thức: ô bắt đầu = + - @ được thêm dấu nháy, giá trị thường giữ nguyên', () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
    expect(safeCell('+84 912')).toBe("'+84 912");
    expect(safeCell('-1+1')).toBe("'-1+1");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(safeCell('\tabc')).toBe("'\tabc");
    expect(safeCell('Nguyễn Văn A')).toBe('Nguyễn Văn A');
    expect(safeCell(null)).toBe('');
  });

  it('giờ Việt Nam', () => {
    expect(fmtVn(new Date('2026-11-24T18:30:00Z'))).toBe('2026-11-25 01:30');
    expect(fmtVn(null)).toBe('');
  });

  const customer = (over: Partial<Customer> = {}): Customer => ({
    id: 'c1', phone: '+84912345678', fullName: 'Nguyễn Văn An', email: null, province: 'Hà Nội', ward: null, addressLine: null,
    firstAffiliateId: null, firstChannelCode: 'facebook', marketingConsent: true, consentAt: now, consentWithdrawnAt: null,
    createdAt: now, updatedAt: now, ...over,
  });
  const T = { returningMinOrders: 2, vipMinOrders: 5, vipMinSpend: 5_000_000, activeDays: 60, atRiskDays: 120 };

  it('file có tiêu đề, một dòng mỗi khách, SĐT giữ nguyên dạng chữ, thống kê và phân loại bằng tiếng Việt', async () => {
    const rows = [
      withClassification(customer(), { validOrders: 5, totalSpent: 3_020_000, lastOrderAt: new Date('2026-11-20T02:00:00Z') }, T, now),
      withClassification(customer({ id: 'c2', fullName: '=HYPERLINK("http://evil.example")', phone: '+84987654321' }), null, T, now),
    ];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(rows)) as never);
    const ws = wb.getWorksheet('Khách hàng')!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(['Họ tên', 'Số điện thoại', 'Tổng chi (VND)', 'Phân loại']));

    // File xlsx không lưu khóa cột nên đọc theo số cột: 1 họ tên, 2 SĐT, 9 đồng ý, 11 số đơn, 12 tổng chi, 14 phân loại, 15 hoạt động.
    const first = ws.getRow(2);
    expect(first.getCell(1).value).toBe('Nguyễn Văn An');
    expect(first.getCell(2).value).toBe('+84912345678');
    expect(first.getCell(9).value).toBe('Có');
    expect(first.getCell(11).value).toBe(5);
    expect(first.getCell(12).value).toBe(3_020_000);
    expect(first.getCell(14).value).toBe('VIP');
    expect(first.getCell(15).value).toBe('Hoạt động');

    const second = ws.getRow(3);
    expect(second.getCell(1).value).toBe(`'=HYPERLINK("http://evil.example")`); // không thành công thức
    expect(second.getCell(2).value).toBe('+84987654321');
    expect(second.getCell(14).value ?? '').toBe(''); // không có thống kê thì để trống
  });
});
