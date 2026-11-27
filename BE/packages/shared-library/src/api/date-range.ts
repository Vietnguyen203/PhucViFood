import { AppException } from './errors';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface VnDateRange {
  from: string;
  to: string;
  /** 00:00 giờ Việt Nam của ngày `from`. */
  start: Date;
  /** 00:00 giờ Việt Nam của ngày SAU `to` (không gồm): dùng làm cận trên `< end`. */
  end: Date;
  days: number;
}

/** Chuỗi yyyy-mm-dd hợp lệ thật (không nhận 2026-02-30). */
function parseDateKey(value: unknown, field: string): string {
  const ok = typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; // loại ngày không có thật như 2026-02-30
  if (!ok) throw AppException.validation([{ field, messages: [`${field} phải là ngày dạng yyyy-mm-dd`] }]);
  return value as string;
}

/**
 * Khoảng ngày cho báo cáo: hai đầu `from` và `to` (yyyy-mm-dd, giờ Việt Nam UTC+7) đều được tính, `from` ≤ `to`, tối đa `maxDays` ngày.
 * Sai định dạng hoặc ngoài giới hạn thì ném lỗi 400 (VALIDATION_ERROR) chỉ rõ trường sai.
 */
export function parseVnDateRange(fromRaw: unknown, toRaw: unknown, maxDays: number): VnDateRange {
  const from = parseDateKey(fromRaw, 'from');
  const to = parseDateKey(toRaw, 'to');
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + DAY_MS);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (days < 1) throw AppException.validation([{ field: 'to', messages: ['to phải từ ngày from trở đi'] }]);
  if (days > maxDays) throw AppException.validation([{ field: 'to', messages: [`Khoảng ngày tối đa ${maxDays} ngày`] }]);
  return { from, to, start, end, days };
}
