import { describe, expect, it } from 'vitest';
import { buildOrderConfirmation, type OrderMailData } from '../../src/orders/order-email';

const base: OrderMailData = {
  code: 'PV-261127-AB12', paymentMethod: 'BANK_QR', subtotalAmount: 240_000n, shippingFee: 30_000n, totalAmount: 270_000n,
  shipping: { name: 'Nguyễn <b>Văn</b> A', phone: '+84912345678', province: 'Hà Nội', ward: 'Cầu Giấy', addressLine: '12 "Trần" & Thái Tông' },
  items: [{ name: 'Khô cá <script>', quantity: 2, unitPrice: 120_000n, lineTotal: 240_000n }],
  transferInstructions: { bankName: 'Vietcombank', accountNo: '0123456789', accountHolder: 'PHUC VI', amount: 270_000n, content: 'PV-261127-AB12', dueAt: '2026-11-28T10:00:00Z' },
};

describe('thư xác nhận đơn', () => {
  const m = buildOrderConfirmation(base, 'khach@example.com', 'https://phucvifoods.vn');

  it('tiêu đề, người nhận và link theo dõi', () => {
    expect(m.to).toBe('khach@example.com');
    expect(m.subject).toBe('Phúc Vị Foods: đã nhận đơn PV-261127-AB12');
    expect(m.html).toContain('href="https://phucvifoods.vn/orders/PV-261127-AB12"');
    expect(m.text).toContain('https://phucvifoods.vn/orders/PV-261127-AB12');
  });
  it('có sản phẩm, tiền, địa chỉ và hướng dẫn chuyển khoản', () => {
    for (const part of ['240.000₫', '30.000₫', '270.000₫', 'Vietcombank', '0123456789', 'PV-261127-AB12']) {
      expect(m.html).toContain(part);
      expect(m.text).toContain(part);
    }
    expect(m.text).toContain('Khô cá <script> × 2'); // bản văn bản giữ nguyên chữ
  });
  it('thoát HTML cho tên, địa chỉ, tên sản phẩm (không chèn được thẻ)', () => {
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>Văn</b>');
    expect(m.html).toContain('Khô cá &lt;script&gt;');
    expect(m.html).toContain('Nguyễn &lt;b&gt;Văn&lt;/b&gt; A');
    expect(m.html).toContain('12 &quot;Trần&quot; &amp; Thái Tông');
  });
  it('COD: không có khối chuyển khoản; miễn phí ship ghi rõ', () => {
    const cod = buildOrderConfirmation({ ...base, paymentMethod: 'COD', shippingFee: 0n, totalAmount: 240_000n, transferInstructions: null }, 'k@x.vn', 'https://x.vn');
    expect(cod.html).not.toContain('Chuyển khoản 270');
    expect(cod.html).toContain('Miễn phí');
    expect(cod.html).toContain('Khi nhận hàng (COD)');
  });

  it('đơn VNPay chưa thanh toán: ghi rõ cách thanh toán, hạn và hướng dẫn mở trang theo dõi; không có phần chuyển khoản', () => {
    const v = buildOrderConfirmation({ ...base, paymentMethod: 'VNPAY', transferInstructions: undefined, onlinePayment: { provider: 'VNPAY', dueAt: '2026-11-28T10:00:00Z' } }, 'khach@example.com', 'https://phucvifoods.vn');
    for (const part of ['Thanh toán online (VNPay)', 'chưa thanh toán xong', 'trang theo dõi']) {
      expect(v.html).toContain(part);
      expect(v.text).toContain(part);
    }
    expect(v.html).not.toContain('Vietcombank');
    const paid = buildOrderConfirmation({ ...base, paymentMethod: 'VNPAY', transferInstructions: undefined, onlinePayment: undefined }, 'khach@example.com', 'https://phucvifoods.vn');
    expect(paid.html).not.toContain('chưa thanh toán xong');
  });
});
