const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Thoát ký tự đặc biệt của HTML: mọi dữ liệu người dùng (tên, địa chỉ, ghi chú) phải qua hàm này trước khi vào thư. */
export const escapeHtml = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Định dạng tiền VND kiểu Việt: 1.234.000₫. */
export const formatVnd = (n: number | bigint): string => `${Number(n).toLocaleString('vi-VN')}₫`;

export interface LayoutOptions { title: string; bodyHtml: string; footerNote?: string }

/** Khung thư chung (màu thương hiệu, chỉ dùng style nội tuyến vì ứng dụng thư không hỗ trợ CSS ngoài). `bodyHtml` phải đã được thoát. */
export function emailLayout({ title, bodyHtml, footerNote }: LayoutOptions): string {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f8f4ec;font-family:Arial,Helvetica,sans-serif;color:#3b2021">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4ec;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#4a0a0d;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:bold">Phúc Vị Foods</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 14px;font-size:20px;color:#4a0a0d">${escapeHtml(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:14px 24px;background:#fbf7f1;color:#826d69;font-size:12px">${escapeHtml(footerNote ?? 'Thư tự động từ Phúc Vị Foods, vui lòng không trả lời thư này.')}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Nút liên kết cho thư. `href` phải là địa chỉ http(s); nếu không thì bỏ qua để tránh link nguy hiểm. */
export function emailButton(href: string, label: string): string {
  if (!/^https?:\/\//i.test(href)) return '';
  return `<p style="margin:18px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#9b1c22;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold">${escapeHtml(label)}</a></p>`;
}
