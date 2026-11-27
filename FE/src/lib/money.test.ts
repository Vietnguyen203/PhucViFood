import { describe, expect, it } from 'vitest';
import { parseMoney, parseThousands } from './money';

describe('đọc số tiền người dùng gõ', () => {
  it('các cách viết quen thuộc cho cùng một số', () => {
    for (const v of ['339000', '339.000', '339,000', '339.000 ₫', '339.000₫', '339.000đ', ' 339 000 ', '339000 VND', '339.000 vnđ']) {
      expect(parseMoney(v), v).toBe(339000);
    }
  });
  it('rỗng là undefined; số 0 hợp lệ', () => {
    expect(parseMoney('')).toBeUndefined();
    expect(parseMoney('   ')).toBeUndefined();
    expect(parseMoney('0')).toBe(0);
  });
  it('chữ, số âm, số lẻ thì NaN', () => {
    for (const v of ['abc', '-5.000', '12a', '₫', '1e6']) expect(parseMoney(v), v).toBeNaN();
  });
});

describe('giá bán gõ theo nghìn đồng', () => {
  it('số nhỏ là nghìn đồng', () => {
    expect(parseThousands('339')).toBe(339_000);
    expect(parseThousands('45')).toBe(45_000);
    expect(parseThousands(' 1 ')).toBe(1_000);
    expect(parseThousands('9999')).toBe(9_999_000);
  });
  it('số đầy đủ hoặc có dấu phân cách nghìn giữ nguyên', () => {
    for (const v of ['339000', '339.000', '339,000', '339.000 ₫', '339.000đ', '339 000', '339000 VND']) expect(parseThousands(v), v).toBe(339_000);
    expect(parseThousands('10000')).toBe(10_000);
    expect(parseThousands('1.250.000')).toBe(1_250_000);
    expect(parseThousands('5.000')).toBe(5_000); // viết đủ dấu chấm thì đúng 5.000₫, không nhân thêm
  });
  it('rỗng, chữ, số lẻ', () => {
    expect(parseThousands('')).toBeUndefined();
    expect(parseThousands('   ')).toBeUndefined();
    for (const v of ['abc', '-5', '12,5', '1e6', '33.9']) expect(parseThousands(v), v).toBeNaN();
  });
});
