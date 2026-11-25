import { describe, expect, it } from 'vitest';
import { AppException } from '../src/api';
import { INTERNAL_KEY_HEADER, InternalKeyGuard } from '../src/auth';
import { SLUG_REGEX, slugify } from '../src/utils';

describe('slugify', () => {
  it.each([
    ['Khô cá lóc 500g', 'kho-ca-loc-500g'],
    ['Đặc sản vùng miền', 'dac-san-vung-mien'],
    ['  Nước mắm Phú Quốc (500ml)!  ', 'nuoc-mam-phu-quoc-500ml'],
    ['Nem chua   Thanh Hóa -- 10 cái', 'nem-chua-thanh-hoa-10-cai'],
    ['ĐÀ LẠT', 'da-lat'],
    ['***', ''],
  ])('%s => %s', (input, expected) => expect(slugify(input)).toBe(expected));

  it('cắt độ dài và không để lại gạch cuối', () => {
    const s = slugify('a'.repeat(40) + ' ' + 'b'.repeat(60), 41);
    expect(s.length).toBeLessThanOrEqual(41);
    expect(s.endsWith('-')).toBe(false);
  });

  it('kết quả luôn khớp SLUG_REGEX (trừ chuỗi rỗng)', () => {
    for (const t of ['Trà Ô Long', 'Cà phê 3 trong 1', 'Gạo ST25']) expect(SLUG_REGEX.test(slugify(t))).toBe(true);
  });
});

describe('InternalKeyGuard', () => {
  const guard = new InternalKeyGuard('khoa-noi-bo-khoa-noi-bo-123');
  const ctx = (headers: Record<string, string | string[] | undefined>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

  it('cho qua khi đúng khóa', () => {
    expect(guard.canActivate(ctx({ [INTERNAL_KEY_HEADER]: 'khoa-noi-bo-khoa-noi-bo-123' }))).toBe(true);
  });

  it.each([[undefined], [''], ['sai-khoa'], [['khoa-noi-bo-khoa-noi-bo-124']]])('từ chối %j', (value) => {
    try {
      guard.canActivate(ctx({ [INTERNAL_KEY_HEADER]: value as string }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).code).toBe('UNAUTHORIZED');
    }
  });
});
