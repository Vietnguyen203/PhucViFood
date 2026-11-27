import { describe, expect, it } from 'vitest';
import { discountFromOriginal, discountProblem, originalFromDiscount, parsePercent } from './pricing';

describe('% giảm từ giá gốc', () => {
  it('làm tròn như backend; không giảm thì 0', () => {
    expect(discountFromOriginal(180_000, 200_000)).toBe(10);
    expect(discountFromOriginal(220_000, 250_000)).toBe(12);
    expect(discountFromOriginal(100_000, null)).toBe(0);
    expect(discountFromOriginal(100_000, 100_000)).toBe(0);
    expect(discountFromOriginal(100_000, 90_000)).toBe(0); // giá gốc thấp hơn giá bán: không coi là giảm
  });
});

describe('giá gốc suy ra từ % giảm', () => {
  it('làm tròn lên nghìn đồng và đúng % khi quy ngược', () => {
    for (const [price, pct] of [[339_000, 20], [180_000, 10], [85_000, 15], [120_000, 30], [45_000, 5], [999_000, 50]] as const) {
      const orig = originalFromDiscount(price, pct)!;
      expect(orig, `${price}/${pct}`).toBeGreaterThan(price);
      expect(discountFromOriginal(price, orig), `${price}/${pct}`).toBe(pct);
    }
    expect(originalFromDiscount(339_000, 20)).toBe(424_000);
  });
  it('giá nhỏ mà làm tròn nghìn lệch % thì dùng số chính xác', () => {
    const o = originalFromDiscount(1_000, 10)!; // 1.111₫ chính xác; làm tròn nghìn thành 2.000₫ sẽ thành 50%
    expect(discountFromOriginal(1_000, o)).toBe(10);
    expect(o).toBeLessThan(1_200);
  });
  it('không giảm hoặc dữ liệu sai thì null', () => {
    for (const [p, d] of [[339_000, 0], [339_000, -5], [339_000, 91], [0, 10], [-1, 10], [NaN, 10], [100, NaN]] as const) {
      expect(originalFromDiscount(p, d), `${p}/${d}`).toBeNull();
    }
  });
});

describe('ô % giảm', () => {
  it('đọc các cách viết', () => {
    expect(parsePercent('20')).toBe(20);
    expect(parsePercent(' 20% ')).toBe(20);
    expect(parsePercent('12,5')).toBe(12.5);
    expect(parsePercent('')).toBe(0);
    expect(parsePercent('abc')).toBe(0);
    expect(parsePercent('-3')).toBe(0);
  });
  it('báo lỗi chữ, số âm, quá 90%', () => {
    expect(discountProblem('')).toBeNull();
    expect(discountProblem('20')).toBeNull();
    expect(discountProblem('90')).toBeNull();
    expect(discountProblem('91')).toMatch(/tối đa 90/);
    expect(discountProblem('abc')).toMatch(/phần trăm/);
    expect(discountProblem('-5')).toMatch(/phần trăm/);
  });
});
