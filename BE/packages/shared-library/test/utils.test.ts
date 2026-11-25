import { describe, expect, it } from 'vitest';
import {
  calculateCommission, calculateShippingFee, chooseReferral, decideAttribution, formatVnd, isContractActiveOn,
  isValidReferralCode, isUuid, maskCustomerName, normalizeChannelCode, normalizeVnPhone, toSafeNumber,
  toVnDateString, uuidv7, type AffiliateSnapshot,
} from '../src/utils';
import { canTransitionOrder } from '../src/contracts';

describe('normalizeVnPhone', () => {
  it.each([
    ['0912 345 678', '+84912345678'],
    ['+84 912-345-678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['912345678', '+84912345678'],
    ['(+84) 901.000.001', '+84901000001'],
  ])('chuẩn hóa %s', (input, expected) => expect(normalizeVnPhone(input)).toBe(expected));

  it.each(['', null, undefined, '12345', '0012345678', '+84 0912345678', '09123456789', 'abc', '091+2345678'])(
    'từ chối %s', (input) => expect(normalizeVnPhone(input as string)).toBeNull(),
  );
});

describe('referral', () => {
  it('kiểm tra mã giới thiệu', () => {
    expect(isValidReferralCode('linh01')).toBe(true);
    expect(isValidReferralCode('abc')).toBe(false); // ngắn
    expect(isValidReferralCode('abcdefghijklm')).toBe(false); // dài 13
    expect(isValidReferralCode('Linh01')).toBe(false); // phải chữ thường
    expect(isValidReferralCode('admin')).toBe(false); // từ khóa giữ chỗ
  });

  it('chuẩn hóa kênh', () => {
    expect(normalizeChannelCode(' TikTok ')).toBe('tiktok');
    expect(normalizeChannelCode('face book')).toBeNull();
  });

  const now = new Date('2026-11-24T00:00:00Z');
  it('mã nhập tay ưu tiên hơn cookie', () => {
    const r = chooseReferral({ inputCode: 'HUNG02', cookie: { code: 'linh01', channelCode: 'tiktok', clickedAt: '2026-11-23T00:00:00Z' }, now });
    expect(r).toEqual({ code: 'hung02', channelCode: null, source: 'CODE' });
  });
  it('mã nhập tay trùng cookie thì giữ kênh', () => {
    const r = chooseReferral({ inputCode: 'LINH01', cookie: { code: 'linh01', channelCode: 'tiktok', clickedAt: '2026-11-23T00:00:00Z' }, now });
    expect(r).toEqual({ code: 'linh01', channelCode: 'tiktok', source: 'CODE' });
  });
  it('dùng cookie còn hạn', () => {
    const r = chooseReferral({ cookie: { code: 'linh01', channelCode: 'facebook', clickedAt: '2026-10-26T00:00:00Z' }, now });
    expect(r).toEqual({ code: 'linh01', channelCode: 'facebook', source: 'LINK' });
  });
  it('bỏ cookie quá 30 ngày', () => {
    expect(chooseReferral({ cookie: { code: 'linh01', channelCode: null, clickedAt: '2026-10-20T00:00:00Z' }, now })).toBeNull();
  });
  it('không có gì thì null', () => expect(chooseReferral({ now })).toBeNull());
});

describe('money', () => {
  it('hoa hồng 10% trên giá sản phẩm, làm tròn xuống', () => {
    expect(calculateCommission(610_000, 1000)).toBe(61_000);
    expect(calculateCommission(333, 1000)).toBe(33); // 33,3
    expect(calculateCommission(0, 1000)).toBe(0);
    expect(calculateCommission(9_007_199_254_740_000n, 1000)).toBe(900_719_925_474_000);
  });
  it('từ chối đầu vào sai', () => {
    expect(() => calculateCommission(100.5, 1000)).toThrow();
    expect(() => calculateCommission(-1, 1000)).toThrow();
    expect(() => calculateCommission(100, 10_001)).toThrow();
    expect(() => calculateCommission(100, 10.5)).toThrow();
  });
  it('phí ship', () => {
    const rule = { flatFee: 30_000, freeThreshold: 500_000 };
    expect(calculateShippingFee(499_999, rule)).toBe(30_000);
    expect(calculateShippingFee(500_000, rule)).toBe(0);
    expect(calculateShippingFee(1_000_000, { flatFee: 30_000, freeThreshold: null })).toBe(30_000);
  });
  it('toSafeNumber và định dạng', () => {
    expect(toSafeNumber(610_000n)).toBe(610_000);
    expect(() => toSafeNumber(2n ** 60n)).toThrow();
    expect(formatVnd(1_250_000)).toContain('1.250.000');
  });
});

describe('ngày giờ Việt Nam', () => {
  it('đổi sang ngày theo UTC+7', () => {
    expect(toVnDateString(new Date('2026-10-31T16:59:59Z'))).toBe('2026-10-31');
    expect(toVnDateString(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11-01');
  });
});

const affiliate = (over: Partial<AffiliateSnapshot> = {}): AffiliateSnapshot => ({
  id: 'aff-1', status: 'ACTIVE', phone: '+84901000001',
  contractStart: '2026-01-01', contractEnd: '2026-10-31', commissionRateBps: 1000, ...over,
});

describe('isContractActiveOn: theo NGÀY ĐẶT HÀNG (giờ VN)', () => {
  it('cuối ngày hết hạn (23:59 VN) vẫn hợp lệ, qua nửa đêm thì hết', () => {
    expect(isContractActiveOn(new Date('2026-10-31T16:59:59Z'), affiliate())).toBe(true);
    expect(isContractActiveOn(new Date('2026-10-31T17:00:00Z'), affiliate())).toBe(false);
  });
  it('ngày đầu hợp đồng', () => {
    expect(isContractActiveOn(new Date('2025-12-31T16:59:59Z'), affiliate())).toBe(false);
    expect(isContractActiveOn(new Date('2025-12-31T17:00:00Z'), affiliate())).toBe(true);
  });
  it('nhận cột DATE của Prisma (Date 00:00 UTC)', () => {
    const a = affiliate({ contractStart: new Date('2026-01-01T00:00:00Z'), contractEnd: new Date('2026-10-31T00:00:00Z') });
    expect(isContractActiveOn(new Date('2026-06-01T00:00:00Z'), a)).toBe(true);
  });
  it('không ACTIVE thì không hợp lệ; thiếu mốc nghĩa là không giới hạn', () => {
    expect(isContractActiveOn(new Date('2026-06-01T00:00:00Z'), affiliate({ status: 'SUSPENDED' }))).toBe(false);
    expect(isContractActiveOn(new Date('2030-01-01T00:00:00Z'), affiliate({ contractEnd: null }))).toBe(true);
  });
});

describe('decideAttribution', () => {
  const orderedAt = new Date('2026-10-15T03:00:00Z');
  const phone = '+84912000001';

  it('CTV hợp lệ: có hoa hồng, chốt tỷ lệ', () => {
    expect(decideAttribution({ affiliate: affiliate({ commissionRateBps: 1200 }), customerPhone: phone, orderedAt })).toEqual({
      affiliateId: 'aff-1', isSelfPurchase: false, commissionEligible: true, rateBps: 1200, reason: 'OK',
    });
  });
  it('không có CTV: vãng lai', () => {
    expect(decideAttribution({ affiliate: null, customerPhone: phone, orderedAt }).reason).toBe('NO_AFFILIATE');
  });
  it('hết hạn tại ngày đặt: vãng lai, không hoa hồng', () => {
    const d = decideAttribution({ affiliate: affiliate(), customerPhone: phone, orderedAt: new Date('2026-11-22T07:00:00Z') });
    expect(d).toMatchObject({ affiliateId: null, commissionEligible: false, rateBps: null, reason: 'OUT_OF_CONTRACT' });
  });
  it('CTV bị tạm khóa: vãng lai', () => {
    expect(decideAttribution({ affiliate: affiliate({ status: 'SUSPENDED' }), customerPhone: phone, orderedAt }).reason).toBe('NOT_ACTIVE');
  });
  it('CTV tự mua: giữ affiliate_id + cờ, không hoa hồng', () => {
    expect(decideAttribution({ affiliate: affiliate(), customerPhone: '+84901000001', orderedAt })).toEqual({
      affiliateId: 'aff-1', isSelfPurchase: true, commissionEligible: false, rateBps: null, reason: 'SELF_PURCHASE',
    });
  });
});

describe('maskCustomerName', () => {
  it('rút gọn thành chữ cái đầu', () => {
    expect(maskCustomerName('Nguyễn Văn An')).toBe('N.V.A');
    expect(maskCustomerName('  đặng  hoàng nam ')).toBe('Đ.H.N');
    expect(maskCustomerName('')).toBe('***');
    expect(maskCustomerName(null)).toBe('***');
  });
});

describe('uuidv7', () => {
  it('đúng định dạng v7 và tăng dần theo thời gian', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_001_000);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect('89ab').toContain(a[19]);
    expect(a < b).toBe(true);
  });
});

describe('luồng trạng thái đơn', () => {
  it('cho phép và chặn đúng', () => {
    expect(canTransitionOrder('PLACED', 'CONFIRMED')).toBe(true);
    expect(canTransitionOrder('DELIVERED', 'COMPLETED')).toBe(true);
    expect(canTransitionOrder('DELIVERED', 'RETURNED')).toBe(true);
    expect(canTransitionOrder('PLACED', 'DELIVERED')).toBe(false);
    expect(canTransitionOrder('COMPLETED', 'RETURNED')).toBe(false);
    expect(canTransitionOrder('CANCELLED', 'PLACED')).toBe(false);
  });
});
