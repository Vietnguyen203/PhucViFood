import { describe, expect, it } from 'vitest';
import { AppException, parseVnDateRange } from '../src/api';

const fails = (from: unknown, to: unknown, max = 366) => {
  try { parseVnDateRange(from, to, max); } catch (e) { return e instanceof AppException ? e : null; }
  return null;
};

describe('khoảng ngày cho báo cáo (giờ Việt Nam)', () => {
  it('một ngày: start là 00:00 giờ VN (17:00 UTC hôm trước), end là 00:00 ngày sau', () => {
    const r = parseVnDateRange('2026-03-16', '2026-03-16', 366);
    expect(r.days).toBe(1);
    expect(r.start.toISOString()).toBe('2026-03-15T17:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-16T17:00:00.000Z');
    expect(r.from).toBe('2026-03-16');
    expect(r.to).toBe('2026-03-16');
  });

  it('nhiều ngày gồm cả hai đầu, kể cả qua tháng và năm nhuận', () => {
    expect(parseVnDateRange('2026-02-27', '2026-03-02', 366).days).toBe(4);
    expect(parseVnDateRange('2024-02-28', '2024-03-01', 366).days).toBe(3);
    expect(parseVnDateRange('2025-01-01', '2025-12-31', 366).days).toBe(365);
  });

  it('từ chối ngày không có thật hoặc sai định dạng', () => {
    for (const v of ['2026-02-30', '2026-13-01', 'abc', '', '2026-1-1', '26-01-01', null, undefined, 20260101]) {
      expect(fails(v, '2026-03-01'), String(v)).toBeInstanceOf(AppException);
      expect(fails('2026-01-01', v), String(v)).toBeInstanceOf(AppException);
    }
  });

  it('từ chối from sau to và khoảng quá giới hạn', () => {
    expect(fails('2026-06-02', '2026-06-01')).toBeInstanceOf(AppException);
    expect(fails('2024-01-01', '2026-01-01')).toBeInstanceOf(AppException);
    expect(fails('2026-01-01', '2026-01-10', 9)).toBeInstanceOf(AppException);
    expect(fails('2026-01-01', '2026-01-09', 9)).toBeNull();
  });
});
