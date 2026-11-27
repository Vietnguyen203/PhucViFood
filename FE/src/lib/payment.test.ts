import { describe, expect, it } from 'vitest';
import { hasVnpayParams, isPaymentGatewayUrl, paymentStatusLabel } from './payment';

describe('nhãn thanh toán', () => {
  it('chưa trả: VNPay là chờ thanh toán online, chuyển khoản là chờ chuyển khoản', () => {
    expect(paymentStatusLabel({ paymentMethod: 'VNPAY', paymentStatus: 'UNPAID' })).toBe('Chờ thanh toán online');
    expect(paymentStatusLabel({ paymentMethod: 'BANK_QR', paymentStatus: 'UNPAID' })).toBe('Chờ chuyển khoản');
    expect(paymentStatusLabel({ paymentMethod: 'COD', paymentStatus: 'PENDING' })).toBe('Thanh toán khi nhận hàng');
    expect(paymentStatusLabel({ paymentMethod: 'VNPAY', paymentStatus: 'PAID' })).toBe('Đã thanh toán');
    expect(paymentStatusLabel({ paymentMethod: 'VNPAY', paymentStatus: 'REFUNDED' })).toBe('Đã hoàn tiền');
  });
});

describe('link cổng thanh toán', () => {
  it('chỉ nhận https của vnpayment.vn (kể cả sandbox)', () => {
    expect(isPaymentGatewayUrl('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=1')).toBe(true);
    expect(isPaymentGatewayUrl('https://pay.vnpayment.vn/paymentv2/vpcpay.html')).toBe(true);
    for (const u of ['http://sandbox.vnpayment.vn/x', 'https://vnpayment.vn.evil.example/x', 'https://evilvnpayment.vn/x', 'javascript:alert(1)', '/relative', '', 'https://example.com']) {
      expect(isPaymentGatewayUrl(u), u).toBe(false);
    }
  });
});

describe('trang kết quả', () => {
  it('nhận biết query của VNPay', () => {
    expect(hasVnpayParams('?vnp_Amount=100&vnp_SecureHash=abc')).toBe(true);
    expect(hasVnpayParams('?vnp_Amount=100')).toBe(false);
    expect(hasVnpayParams('')).toBe(false);
  });
});
