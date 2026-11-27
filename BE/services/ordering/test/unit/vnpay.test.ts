import { describe, expect, it } from 'vitest';
import { buildPaymentUrl, hmacSha512, isSuccessful, pickVnpParams, responseMessage, signingString, verifySignature, vnpDate } from '../../src/payments/vnpay';

const SECRET = 'THIS_IS_A_TEST_SECRET_FOR_VNPAY_0123456789';
const base = { tmnCode: 'TESTTMN1', hashSecret: SECRET, payUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html', returnUrl: 'https://shop.example.vn/thanh-toan/vnpay' };

const parse = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());

describe('vnpDate (giờ Việt Nam)', () => {
  it('cộng 7 giờ so với UTC, đủ 14 chữ số', () => {
    expect(vnpDate(new Date('2026-11-27T17:30:05Z'))).toBe('20261128003005'); // sang ngày hôm sau theo giờ VN
    expect(vnpDate(new Date('2026-01-02T03:04:05Z'))).toBe('20260102100405');
  });
});

describe('chuỗi ký', () => {
  it('sắp A-Z, bỏ chữ ký và tham số ngoài vnp_, mã hóa URL (khoảng trắng thành +)', () => {
    const s = signingString({ vnp_B: 'x y', vnp_A: 'Việt', other: '1', vnp_SecureHash: 'abc', vnp_SecureHashType: 'SHA512', vnp_Empty: '' });
    expect(s).toBe('vnp_A=Vi%E1%BB%87t&vnp_B=x+y');
  });
  it('HMAC-SHA512 trả 128 ký tự hex và khác nhau theo khóa', () => {
    expect(hmacSha512('k1', 'data')).toMatch(/^[0-9a-f]{128}$/);
    expect(hmacSha512('k1', 'data')).not.toBe(hmacSha512('k2', 'data'));
  });
});

describe('link thanh toán', () => {
  const url = buildPaymentUrl({ ...base, txnRef: 'PV-261127-AB12', amountVnd: 339_000, orderInfo: 'Thanh toan don hang PV-261127-AB12', ipAddr: '1.2.3.4', now: new Date('2026-11-27T01:00:00Z'), expiresAt: new Date('2026-11-27T01:15:00Z') });
  const p = parse(url);

  it('đủ tham số: số tiền nhân 100, ngày giờ VN, mã đơn làm vnp_TxnRef', () => {
    expect(url.startsWith(`${base.payUrl}?`)).toBe(true);
    expect(p).toMatchObject({
      vnp_Version: '2.1.0', vnp_Command: 'pay', vnp_TmnCode: 'TESTTMN1', vnp_Amount: '33900000', vnp_CurrCode: 'VND', vnp_TxnRef: 'PV-261127-AB12',
      vnp_ReturnUrl: base.returnUrl, vnp_IpAddr: '1.2.3.4', vnp_CreateDate: '20261127080000', vnp_ExpireDate: '20261127081500', vnp_Locale: 'vn',
    });
    expect(p.vnp_OrderInfo).toBe('Thanh toan don hang PV-261127-AB12');
  });
  it('chữ ký đúng với khóa, sai với khóa khác hoặc khi sửa số tiền', () => {
    expect(verifySignature(p, SECRET)).toBe(true);
    expect(verifySignature(p, 'khoa-khac-khoa-khac')).toBe(false);
    expect(verifySignature({ ...p, vnp_Amount: '100' }, SECRET)).toBe(false);
    expect(verifySignature({ ...p, vnp_TxnRef: 'PV-261127-ZZZZ' }, SECRET)).toBe(false);
  });
});

describe('xác thực dữ liệu VNPay gửi về', () => {
  const signed = (extra: Record<string, string>) => {
    const params: Record<string, string> = { vnp_TmnCode: 'TESTTMN1', vnp_Amount: '33900000', vnp_TxnRef: 'PV-1', vnp_ResponseCode: '00', vnp_TransactionNo: '14000001', ...extra };
    return { ...params, vnp_SecureHash: hmacSha512(SECRET, signingString(params)) };
  };
  it('hợp lệ khi đúng chữ ký (kể cả vnp_SecureHashType thừa); sai khi thiếu, sai định dạng hoặc bị sửa', () => {
    const ok = signed({});
    expect(verifySignature(ok, SECRET)).toBe(true);
    expect(verifySignature({ ...ok, vnp_SecureHashType: 'SHA512' }, SECRET)).toBe(true);
    expect(verifySignature({ ...ok, vnp_SecureHash: ok.vnp_SecureHash.toUpperCase() }, SECRET)).toBe(true);
    expect(verifySignature({ ...ok, vnp_ResponseCode: '24' }, SECRET)).toBe(false);
    const { vnp_SecureHash: _drop, ...noHash } = ok;
    expect(verifySignature(noHash, SECRET)).toBe(false);
    expect(verifySignature({ ...ok, vnp_SecureHash: 'abc' }, SECRET)).toBe(false);
    expect(verifySignature({ ...ok, vnp_SecureHash: 'z'.repeat(128) }, SECRET)).toBe(false);
  });
  it('chỉ nhận tham số chuỗi vnp_', () => {
    expect(pickVnpParams({ vnp_A: '1', other: '2', vnp_B: ['x'], vnp_C: { a: 1 }, vnp_D: 'x'.repeat(1001) })).toEqual({ vnp_A: '1' });
  });
  it('thành công khi mã phản hồi và mã giao dịch đều 00', () => {
    expect(isSuccessful({ vnp_ResponseCode: '00' })).toBe(true);
    expect(isSuccessful({ vnp_ResponseCode: '00', vnp_TransactionStatus: '00' })).toBe(true);
    expect(isSuccessful({ vnp_ResponseCode: '00', vnp_TransactionStatus: '02' })).toBe(false);
    expect(isSuccessful({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })).toBe(false);
    expect(isSuccessful({})).toBe(false);
  });
  it('thông báo cho khách theo mã, mã lạ có thông báo chung', () => {
    expect(responseMessage('00')).toBe('Thanh toán thành công');
    expect(responseMessage('24')).toContain('hủy');
    expect(responseMessage('999')).toBe('Thanh toán chưa thành công');
    expect(responseMessage(undefined)).toBe('Thanh toán chưa thành công');
  });
});
