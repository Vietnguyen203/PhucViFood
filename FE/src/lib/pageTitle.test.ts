import { describe, expect, it } from 'vitest';
import { formatTitle } from './pageTitle';

describe('tiêu đề trang', () => {
  it('ghép tên trang với tên cửa hàng', () => expect(formatTitle('Giỏ hàng')).toBe('Giỏ hàng | Phúc Vị Foods'));
  it('cắt khoảng trắng thừa', () => expect(formatTitle('  Tin tức ')).toBe('Tin tức | Phúc Vị Foods'));
  it('không có tên trang: tiêu đề mặc định', () => {
    for (const v of [undefined, null, '', '   ']) expect(formatTitle(v)).toBe('Phúc Vị Foods - Đặc sản Việt giao tận nhà');
  });
});
