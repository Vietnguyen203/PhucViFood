import { describe, expect, it } from 'vitest';
import { bankConfigured, chartBars, dayLabel, type ShopSetting } from './dashboard';

const d = (date: string, revenue: number, orders = revenue > 0 ? 1 : 0) => ({ date, orders, revenue });
const s = (key: string, value: ShopSetting['value']): ShopSetting => ({ key, value, description: null, updatedBy: null, updatedAt: null });

describe('chartBars', () => {
  it('cột cao nhất 100%, các cột khác theo tỷ lệ', () => {
    const bars = chartBars([d('2026-11-24', 100_000), d('2026-11-25', 50_000), d('2026-11-26', 200_000)]);
    expect(bars.map((b) => b.heightPct)).toEqual([50, 25, 100]);
    expect(bars.map((b) => b.label)).toEqual(['24/11', '25/11', '26/11']);
  });
  it('ngày không có doanh thu là 0; ngày rất nhỏ vẫn thấy được (tối thiểu 3%)', () => {
    const bars = chartBars([d('2026-11-24', 0), d('2026-11-25', 1), d('2026-11-26', 1_000_000)]);
    expect(bars.map((b) => b.heightPct)).toEqual([0, 3, 100]);
  });
  it('toàn bộ bằng 0 hoặc rỗng: không chia cho 0', () => {
    expect(chartBars([d('2026-11-25', 0), d('2026-11-26', 0)]).map((b) => b.heightPct)).toEqual([0, 0]);
    expect(chartBars([])).toEqual([]);
  });
  it('giữ nguyên số đơn và doanh thu', () => {
    expect(chartBars([d('2026-11-26', 5_000, 3)])[0]).toMatchObject({ orders: 3, revenue: 5_000 });
  });
});

describe('dayLabel', () => {
  it('dd/mm từ yyyy-mm-dd', () => expect(dayLabel('2026-01-05')).toBe('05/01'));
});

describe('bankConfigured', () => {
  const full = [s('payment.bank_name', 'Vietcombank'), s('payment.bank_account_no', '0011000000000'), s('payment.bank_account_holder', 'CONG TY')];
  it('đủ ba trường thì đã cấu hình', () => expect(bankConfigured(full)).toBe(true));
  it('thiếu một trường, rỗng hoặc chưa có trong DB (null) thì chưa', () => {
    expect(bankConfigured(full.slice(0, 2))).toBe(false);
    expect(bankConfigured([...full.slice(0, 2), s('payment.bank_account_holder', '   ')])).toBe(false);
    expect(bankConfigured([...full.slice(0, 2), s('payment.bank_account_holder', null)])).toBe(false);
    expect(bankConfigured([])).toBe(false);
  });
});
