// Dữ liệu và hàm thuần cho trang tổng quan admin và màn cấu hình bán hàng.
import type { OrderStatus } from './types';

export interface Window { orders: number; revenue: number }
export interface DailyPoint { date: string; orders: number; revenue: number }
export interface OrderOverview {
  byStatus: Record<OrderStatus, number>;
  awaitingPayment: number;
  cskhWaiting: number;
  today: Window;
  last7Days: Window;
  last30Days: Window;
  daily: DailyPoint[];
}

export interface ShopSetting {
  key: string;
  kind?: 'int' | 'text';
  value: number | string | null;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface Bar { date: string; label: string; orders: number; revenue: number; heightPct: number }

/** dd/mm từ yyyy-mm-dd (không đổi múi giờ: chuỗi ngày đã là ngày Việt Nam). */
export const dayLabel = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * Cột biểu đồ doanh thu: chiều cao theo phần trăm của ngày cao nhất. Ngày có doanh thu luôn thấy được (tối thiểu 3%),
 * ngày không có thì 0. Tất cả bằng 0 thì mọi cột 0 (tránh chia cho 0).
 */
export function chartBars(daily: DailyPoint[]): Bar[] {
  const max = Math.max(0, ...daily.map((d) => d.revenue));
  return daily.map((d) => ({
    ...d,
    label: dayLabel(d.date),
    heightPct: max === 0 || d.revenue <= 0 ? 0 : Math.max(3, Math.round((d.revenue / max) * 100)),
  }));
}

/** Tài khoản nhận chuyển khoản đã cấu hình đủ ba trường chưa (thiếu thì khách chọn chuyển khoản sẽ không thấy hướng dẫn). */
export function bankConfigured(settings: ShopSetting[]): boolean {
  return ['payment.bank_name', 'payment.bank_account_no', 'payment.bank_account_holder']
    .every((k) => typeof settings.find((s) => s.key === k)?.value === 'string' && String(settings.find((s) => s.key === k)?.value).trim() !== '');
}

/** Nhãn tiếng Việt cho các khóa cấu hình; khóa lạ hiện nguyên khóa. */
export const SETTING_LABEL: Record<string, { label: string; unit?: 'vnd' | 'phút' | 'ngày' | '%'; hint?: string }> = {
  'shipping.flat_fee': { label: 'Phí giao hàng đồng giá', unit: 'vnd', hint: 'Áp dụng cho đơn chưa đủ mức miễn phí.' },
  'shipping.free_threshold': { label: 'Miễn phí giao hàng từ', unit: 'vnd', hint: 'Tổng tiền sản phẩm (chưa gồm phí ship) từ mức này thì miễn phí giao hàng.' },
  'payment.hold_minutes': { label: 'Giữ hàng cho đơn chuyển khoản', unit: 'phút', hint: '' },
  'payment.bank_name': { label: 'Ngân hàng nhận tiền' },
  'payment.bank_account_no': { label: 'Số tài khoản nhận tiền', hint: '6-30 chữ số.' },
  'payment.bank_account_holder': { label: 'Chủ tài khoản' },
  default_rate_bps: { label: 'Tỷ lệ hoa hồng mặc định', unit: '%', hint: 'Áp cho CTV đăng ký mới và CTV được duyệt mà không nhập tỷ lệ riêng. CTV đã có tỷ lệ riêng giữ nguyên; chỉ áp cho đơn đặt sau đó.' },
  cookie_days: { label: 'Thời hạn ghi nhận link CTV', unit: 'ngày', hint: 'Khách bấm link CTV rồi đặt hàng trong số ngày này thì đơn tính hoa hồng cho CTV. Chỉ áp dụng cho lượt bấm mới.' },
};
