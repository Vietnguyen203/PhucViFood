// Báo cáo theo khoảng ngày: kiểu dữ liệu, khoảng ngày chọn nhanh và xuất CSV (hàm thuần, dễ test).
import type { DailyPoint } from './dashboard';
import type { OrderStatus, PaymentMethod } from './types';

export interface SalesReport {
  range: { from: string; to: string; days: number };
  totals: {
    orders: number; revenue: number; averageOrderValue: number; shippingRevenue: number;
    viaAffiliate: { orders: number; revenue: number };
  };
  byStatus: Record<OrderStatus, number>;
  byPayment: Array<{ method: PaymentMethod; orders: number; revenue: number }>;
  daily: DailyPoint[];
  topProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
}

export interface DateRange { from: string; to: string }

const VN_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Ngày (yyyy-mm-dd) theo giờ Việt Nam của một thời điểm. */
export const vnToday = (now: Date = new Date()): string => new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (key: string, days: number): string => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export type PresetKey = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';
export const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'last7', label: '7 ngày' },
  { key: 'last30', label: '30 ngày' },
  { key: 'thisMonth', label: 'Tháng này' },
  { key: 'lastMonth', label: 'Tháng trước' },
];

/** Khoảng ngày chọn nhanh, tính theo ngày Việt Nam của `now`. */
export function presetRange(key: PresetKey, now: Date = new Date()): DateRange {
  const today = vnToday(now);
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'lastMonth': {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
  }
}

/** Lỗi nhập khoảng ngày (null nếu hợp lệ). Khớp giới hạn của backend: from ≤ to, tối đa 366 ngày. */
export function rangeError(r: DateRange): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.to)) return 'Vui lòng chọn đủ ngày bắt đầu và kết thúc.';
  const days = Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / DAY_MS) + 1;
  if (!Number.isFinite(days) || days < 1) return 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
  if (days > 366) return 'Khoảng ngày tối đa 366 ngày.';
  return null;
}

/** Một ô CSV: bao dấu nháy khi có dấu phẩy, nháy kép hoặc xuống dòng; chặn ô bắt đầu bằng ký tự mà Excel hiểu là công thức. */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV theo ngày (dấu phẩy, có BOM để Excel mở đúng tiếng Việt): ngày, số đơn, doanh thu. */
export function dailyCsv(report: SalesReport): string {
  const rows = [['Ngày', 'Số đơn', 'Doanh thu (VND)'], ...report.daily.map((d) => [d.date, d.orders, d.revenue])];
  rows.push(['Tổng', report.totals.orders, report.totals.revenue]);
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** CSV sản phẩm bán chạy trong khoảng. */
export function productsCsv(report: SalesReport): string {
  const rows = [['Sản phẩm', 'Số lượng', 'Doanh thu (VND)'], ...report.topProducts.map((p) => [p.name, p.quantity, p.revenue])];
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
