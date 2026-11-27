import { describe, expect, it } from 'vitest';
import { commissionsByDay } from './partner';

// 2026-03-16 05:00 giờ Việt Nam
const NOW = new Date('2026-03-15T22:00:00Z');

describe('hoa hồng theo ngày', () => {
  it('đủ ngày liên tiếp, ngày cuối là hôm nay theo giờ Việt Nam', () => {
    const d = commissionsByDay([], 7, NOW);
    expect(d).toHaveLength(7);
    expect(d[0].date).toBe('2026-03-10');
    expect(d[6].date).toBe('2026-03-16');
    expect(d.every((p) => p.orders === 0 && p.revenue === 0)).toBe(true);
  });
  it('cộng dồn theo ngày giờ Việt Nam (23h UTC đã là ngày hôm sau), bỏ khoản đã hủy', () => {
    const d = commissionsByDay([
      { createdAt: '2026-03-15T20:00:00Z', amount: 1000, status: 'ESTIMATED' }, // 03:00 ngày 16
      { createdAt: '2026-03-15T23:30:00Z', amount: 500, status: 'PAID' },        // 06:30 ngày 16
      { createdAt: '2026-03-15T23:30:00Z', amount: 9999, status: 'CANCELLED' },
      { createdAt: '2026-03-12T02:00:00Z', amount: 700, status: 'CONFIRMED' },   // ngày 12
    ], 7, NOW);
    expect(d.find((p) => p.date === '2026-03-16')).toMatchObject({ orders: 2, revenue: 1500 });
    expect(d.find((p) => p.date === '2026-03-12')).toMatchObject({ orders: 1, revenue: 700 });
  });
  it('bỏ khoản nằm ngoài khoảng', () => {
    const d = commissionsByDay([{ createdAt: '2026-01-01T00:00:00Z', amount: 5, status: 'PAID' }], 7, NOW);
    expect(d.reduce((n, p) => n + p.revenue, 0)).toBe(0);
  });
});
