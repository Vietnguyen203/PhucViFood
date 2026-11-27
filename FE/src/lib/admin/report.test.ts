import { describe, expect, it } from 'vitest';
import { affiliatesCsv, csvCell, dailyCsv, presetRange, productsCsv, rangeError, vnToday, type CommissionReport, type SalesReport } from './report';

// 2026-03-15 22:00 UTC = 2026-03-16 05:00 giờ Việt Nam
const NOW = new Date('2026-03-15T22:00:00Z');

describe('khoảng ngày chọn nhanh (giờ Việt Nam)', () => {
  it('hôm nay lấy theo ngày Việt Nam, không phải UTC', () => {
    expect(vnToday(NOW)).toBe('2026-03-16');
    expect(presetRange('today', NOW)).toEqual({ from: '2026-03-16', to: '2026-03-16' });
  });
  it('7 và 30 ngày gồm cả hôm nay', () => {
    expect(presetRange('last7', NOW)).toEqual({ from: '2026-03-10', to: '2026-03-16' });
    expect(presetRange('last30', NOW)).toEqual({ from: '2026-02-15', to: '2026-03-16' });
  });
  it('tháng này và tháng trước, kể cả qua năm', () => {
    expect(presetRange('thisMonth', NOW)).toEqual({ from: '2026-03-01', to: '2026-03-16' });
    expect(presetRange('lastMonth', NOW)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('lastMonth', new Date('2026-01-10T00:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('lastMonth', new Date('2024-03-10T00:00:00Z'))).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('kiểm tra khoảng ngày', () => {
  it('hợp lệ', () => {
    expect(rangeError({ from: '2026-01-01', to: '2026-01-01' })).toBeNull();
    expect(rangeError({ from: '2025-01-01', to: '2025-12-31' })).toBeNull();
  });
  it('thiếu ngày, ngược thứ tự, quá 366 ngày', () => {
    expect(rangeError({ from: '', to: '2026-01-01' })).toMatch(/đủ ngày/);
    expect(rangeError({ from: '2026-01-02', to: '2026-01-01' })).toMatch(/từ ngày bắt đầu/);
    expect(rangeError({ from: '2024-01-01', to: '2026-01-01' })).toMatch(/366/);
  });
});

describe('xuất CSV', () => {
  it('bao ô có dấu phẩy, nháy kép, xuống dòng', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('nói "hay"')).toBe('"nói ""hay"""');
    expect(csvCell('bình thường')).toBe('bình thường');
    expect(csvCell(1234)).toBe('1234');
  });
  it('chặn công thức Excel nhưng giữ số âm', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-5')).toBe('-5');
  });
  const report = {
    range: { from: '2026-03-01', to: '2026-03-02', days: 2 },
    totals: { orders: 3, revenue: 600_000, averageOrderValue: 200_000, shippingRevenue: 0, viaAffiliate: { orders: 1, revenue: 100_000 } },
    byStatus: {}, byPayment: [],
    daily: [{ date: '2026-03-01', orders: 1, revenue: 100_000 }, { date: '2026-03-02', orders: 2, revenue: 500_000 }],
    topProducts: [{ productId: 'p', name: 'Khô cá, loại 1', quantity: 4, revenue: 400_000 }],
  } as unknown as SalesReport;
  it('CSV theo ngày có BOM, tiêu đề, từng ngày và dòng tổng', () => {
    const csv = dailyCsv(report);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n').filter(Boolean)).toEqual(['﻿Ngày,Số đơn,Doanh thu (VND)', '2026-03-01,1,100000', '2026-03-02,2,500000', 'Tổng,3,600000']);
  });
  it('CSV sản phẩm bao tên có dấu phẩy', () => {
    expect(productsCsv(report).split('\r\n')[1]).toBe('"Khô cá, loại 1",4,400000');
  });
});

describe('CSV cộng tác viên', () => {
  it('có BOM, tiêu đề; tên null dùng id; tên có dấu phẩy được bao', () => {
    const r = { topAffiliates: [
      { affiliateId: 'a1', fullName: 'Nguyễn, Linh', referralCode: 'linh01', commissions: 2, baseAmount: 1000, amount: 100 },
      { affiliateId: 'a2', fullName: null, referralCode: null, commissions: 1, baseAmount: 500, amount: 50 },
    ] } as unknown as CommissionReport;
    expect(affiliatesCsv(r).split('\r\n').filter(Boolean)).toEqual([
      '\uFEFFCộng tác viên,Mã giới thiệu,Số khoản,Doanh số (VND),Hoa hồng (VND)',
      '"Nguyễn, Linh",linh01,2,1000,100',
      'a2,,1,500,50',
    ]);
  });
});
