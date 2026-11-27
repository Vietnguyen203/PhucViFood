import { emailButton, emailLayout, escapeHtml, formatVnd, type MailMessage } from '@phucvi/shared-library/mail';

/** Phần dữ liệu đơn dùng cho thư (cùng dạng `toPublicView` trả cho khách). Tiền là số nguyên VND (có thể là bigint). */
export interface OrderMailData {
  code: string;
  paymentMethod: string;
  subtotalAmount: number | bigint;
  shippingFee: number | bigint;
  totalAmount: number | bigint;
  shipping: { name: string; phone: string; province: string; ward: string; addressLine: string };
  items?: Array<{ name: string; quantity: number; unitPrice: number | bigint; lineTotal: number | bigint }>;
  transferInstructions?: { bankName: string; accountNo: string; accountHolder: string; amount: number | bigint; content: string; dueAt: Date | string | null } | null;
}

const fmtDue = (d: Date | string): string => new Date(d).toLocaleString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Thư xác nhận đặt hàng gửi cho khách: mã đơn, sản phẩm, tiền, địa chỉ giao, hướng dẫn chuyển khoản (nếu có) và link theo dõi.
 * Mọi dữ liệu khách nhập đều được thoát HTML.
 */
export function buildOrderConfirmation(o: OrderMailData, to: string, publicBaseUrl: string): MailMessage {
  const trackUrl = `${publicBaseUrl}/don-hang/${encodeURIComponent(o.code)}`;
  const items = o.items ?? [];
  const t = o.transferInstructions;
  const addr = `${o.shipping.addressLine}, ${o.shipping.ward}, ${o.shipping.province}`;

  const rows = items.map((i) =>
    `<tr><td style="padding:6px 0">${escapeHtml(i.name)} × ${i.quantity}</td><td align="right" style="padding:6px 0">${escapeHtml(formatVnd(i.lineTotal))}</td></tr>`).join('');
  const totals = `
<tr><td style="padding:6px 0;border-top:1px solid #eadfd2">Tạm tính</td><td align="right" style="padding:6px 0;border-top:1px solid #eadfd2">${escapeHtml(formatVnd(o.subtotalAmount))}</td></tr>
<tr><td style="padding:6px 0">Phí giao hàng</td><td align="right" style="padding:6px 0">${Number(o.shippingFee) === 0 ? 'Miễn phí' : escapeHtml(formatVnd(o.shippingFee))}</td></tr>
<tr><td style="padding:6px 0;font-weight:bold">Tổng cộng</td><td align="right" style="padding:6px 0;font-weight:bold;color:#9b1c22">${escapeHtml(formatVnd(o.totalAmount))}</td></tr>`;

  const transferHtml = t
    ? `<div style="margin:14px 0;padding:12px 14px;background:#fbf1d8;border-radius:10px;font-size:14px">
<b>Chuyển khoản ${escapeHtml(formatVnd(t.amount))}</b><br>${escapeHtml(t.bankName)} · ${escapeHtml(t.accountNo)} · ${escapeHtml(t.accountHolder)}<br>Nội dung: <b>${escapeHtml(t.content)}</b>${t.dueAt ? `<br>Vui lòng chuyển trước ${escapeHtml(fmtDue(t.dueAt))}, quá hạn đơn sẽ tự hủy.` : ''}</div>`
    : '';

  const bodyHtml = `<p style="margin:0 0 12px">Chào ${escapeHtml(o.shipping.name)}, Phúc Vị đã nhận được đơn hàng của bạn. Mã đơn: <b>${escapeHtml(o.code)}</b>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}${totals}</table>
${transferHtml}
<p style="margin:14px 0 4px;font-size:14px"><b>Giao tới:</b> ${escapeHtml(o.shipping.name)}, ${escapeHtml(o.shipping.phone)}<br>${escapeHtml(addr)}</p>
<p style="margin:4px 0;font-size:14px"><b>Thanh toán:</b> ${o.paymentMethod === 'COD' ? 'Khi nhận hàng (COD)' : 'Chuyển khoản'}</p>
${emailButton(trackUrl, 'Theo dõi đơn hàng')}
<p style="margin:0;font-size:12px;color:#826d69">Tra cứu đơn bằng mã đơn và số điện thoại đã dùng khi đặt hàng.</p>`;

  const text = [
    `Chào ${o.shipping.name}, Phúc Vị đã nhận được đơn hàng của bạn. Mã đơn: ${o.code}.`,
    '',
    ...items.map((i) => `- ${i.name} × ${i.quantity}: ${formatVnd(i.lineTotal)}`),
    `Tạm tính: ${formatVnd(o.subtotalAmount)}`,
    `Phí giao hàng: ${Number(o.shippingFee) === 0 ? 'Miễn phí' : formatVnd(o.shippingFee)}`,
    `Tổng cộng: ${formatVnd(o.totalAmount)}`,
    '',
    ...(t ? [`Chuyển khoản ${formatVnd(t.amount)} tới ${t.bankName} · ${t.accountNo} · ${t.accountHolder}, nội dung: ${t.content}${t.dueAt ? `, trước ${fmtDue(t.dueAt)}` : ''}.`, ''] : []),
    `Giao tới: ${o.shipping.name}, ${o.shipping.phone}, ${addr}`,
    `Theo dõi đơn: ${trackUrl}`,
  ].join('\n');

  return { to, subject: `Phúc Vị Foods: đã nhận đơn ${o.code}`, text, html: emailLayout({ title: 'Cảm ơn bạn đã đặt hàng', bodyHtml }) };
}
