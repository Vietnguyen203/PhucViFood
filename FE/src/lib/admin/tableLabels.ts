/**
 * Gắn nhãn cột vào từng ô của bảng (thuộc tính data-label lấy từ chữ ở tiêu đề cột) để CSS hiện mỗi dòng thành một thẻ trên điện thoại.
 * Dòng có ô gộp cột (colSpan, vd "Chưa có dữ liệu") và cột không có chữ tiêu đề (ảnh, nút hành động) thì không gắn nhãn.
 */
export function labelTable(table: HTMLTableElement): void {
  const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').replace(/[▲▼↑↓]/g, '').trim());
  if (heads.length === 0) return;
  for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
    const cells = Array.from(row.children) as HTMLElement[];
    if (cells.some((c) => (c as HTMLTableCellElement).colSpan > 1)) continue;
    cells.forEach((cell, i) => {
      const label = heads[i] ?? '';
      if (label) cell.setAttribute('data-label', label);
      else cell.removeAttribute('data-label');
    });
  }
}
