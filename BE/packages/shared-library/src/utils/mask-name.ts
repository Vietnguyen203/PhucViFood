/**
 * Tên viết tắt hiển thị cho CTV: "Nguyễn Văn An" => "N.V.A". CTV không được thấy tên đầy đủ, SĐT hay địa chỉ.
 */
export function maskCustomerName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '***';
  return parts.map((p) => Array.from(p)[0].toLocaleUpperCase('vi-VN')).join('.');
}
