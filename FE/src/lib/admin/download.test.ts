import { describe, expect, it } from 'vitest';
import { parseFileName } from './download';

describe('parseFileName', () => {
  it('dạng có ngoặc kép', () => expect(parseFileName('attachment; filename="khach-hang-202611261424.xlsx"')).toBe('khach-hang-202611261424.xlsx'));
  it('dạng không ngoặc', () => expect(parseFileName('attachment; filename=a.xlsx')).toBe('a.xlsx'));
  it('dạng filename* mã hóa', () => expect(parseFileName("attachment; filename*=UTF-8''kh%C3%A1ch.xlsx")).toBe('khách.xlsx'));
  it('thiếu header: tên mặc định', () => { expect(parseFileName(null)).toBe('khach-hang.xlsx'); expect(parseFileName('attachment')).toBe('khach-hang.xlsx'); });
});
