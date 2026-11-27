import { describe, expect, it } from 'vitest';
import { labelTable } from './tableLabels';

/** Ô và dòng giả đủ phần mà labelTable dùng (dự án chưa dùng môi trường DOM trong test). */
class Cell {
  attrs = new Map<string, string>();
  constructor(public textContent = '', public colSpan = 1) {}
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
}
const fakeTable = (heads: string[], rows: Cell[][]) => ({
  querySelectorAll: (sel: string) => (sel === 'thead th' ? heads.map((h) => new Cell(h)) : sel === 'tbody tr' ? rows.map((children) => ({ children })) : []),
}) as unknown as HTMLTableElement;

describe('gắn nhãn cột cho bảng', () => {
  it('lấy chữ ở tiêu đề cột, bỏ ký hiệu sắp xếp, cột trống không có nhãn', () => {
    const row = [new Cell('ảnh'), new Cell('Khô cá'), new Cell('1')];
    labelTable(fakeTable(['', 'Sản phẩm ▲', 'Giá'], [row]));
    expect(row.map((c) => c.attrs.get('data-label') ?? null)).toEqual([null, 'Sản phẩm', 'Giá']);
  });
  it('xóa nhãn cũ khi cột không còn tiêu đề', () => {
    const cell = new Cell('x');
    cell.attrs.set('data-label', 'Cũ');
    labelTable(fakeTable([''], [[cell]]));
    expect(cell.attrs.has('data-label')).toBe(false);
  });
  it('bỏ qua dòng có ô gộp cột', () => {
    const row = [new Cell('Chưa có dữ liệu', 2)];
    labelTable(fakeTable(['A', 'B'], [row]));
    expect(row[0].attrs.has('data-label')).toBe(false);
  });
  it('bảng không có tiêu đề thì không làm gì', () => {
    const row = [new Cell('x')];
    labelTable(fakeTable([], [row]));
    expect(row[0].attrs.size).toBe(0);
  });
});
