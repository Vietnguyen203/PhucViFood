import { describe, expect, it } from 'vitest';
import { findPriceRange, PRICE_RANGES } from './priceRange';

describe('khoảng giá', () => {
  it('các khoảng nối liền nhau, không chồng lấn', () => {
    for (let i = 1; i < PRICE_RANGES.length; i++) {
      expect(PRICE_RANGES[i].min).toBe((PRICE_RANGES[i - 1].max ?? NaN) + 1);
    }
  });
  it('tìm theo khóa; khóa lạ hoặc rỗng thì không lọc', () => {
    expect(findPriceRange('100-200')).toMatchObject({ min: 100_000, max: 200_000 });
    for (const v of ['', null, undefined, 'abc', 'constructor']) expect(findPriceRange(v as string | null)).toBeNull();
  });
});
