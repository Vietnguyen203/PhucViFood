import { describe, expect, it } from 'vitest';
import { CUSTOMER_SETTINGS } from '../src/seed-data';
import { classifyCustomer, thresholdsFromSettings, type SegmentThresholds } from '../src/utils';

const T: SegmentThresholds = { returningMinOrders: 2, vipMinOrders: 5, vipMinSpend: 5_000_000, activeDays: 60, atRiskDays: 120 };
const now = new Date('2026-11-25T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('classifyCustomer', () => {
  // Số liệu của 5 khách trong dữ liệu mẫu (thống kê lấy từ ordering_db, xem BE/docs/queries/03).
  it.each([
    ['VIP theo số đơn (5 đơn, 3.020.000đ)', { validOrders: 5, totalSpent: 3_020_000, lastOrderAt: new Date('2026-11-20T02:00:00Z') }, 'VIP', 'ACTIVE'],
    ['khách quen (2 đơn)', { validOrders: 2, totalSpent: 580_000, lastOrderAt: new Date('2026-11-22T07:00:00Z') }, 'RETURNING', 'ACTIVE'],
    ['khách mới đã rời (1 đơn từ tháng 5)', { validOrders: 1, totalSpent: 375_000, lastOrderAt: new Date('2026-05-15T12:00:00Z') }, 'NEW', 'CHURNED'],
    ['khách mới đang hoạt động', { validOrders: 1, totalSpent: 315_000, lastOrderAt: new Date('2026-11-24T01:30:00Z') }, 'NEW', 'ACTIVE'],
  ])('%s', (_n, stats, tier, activity) => {
    expect(classifyCustomer(stats, T, now)).toEqual({ tier, activity });
  });

  it('VIP theo tổng chi tiêu dù ít đơn', () => {
    expect(classifyCustomer({ validOrders: 1, totalSpent: 5_000_000, lastOrderAt: daysAgo(1) }, T, now).tier).toBe('VIP');
    expect(classifyCustomer({ validOrders: 1, totalSpent: 4_999_999, lastOrderAt: daysAgo(1) }, T, now).tier).toBe('NEW');
  });

  it('ranh giới số đơn: 1 mới, 2 quen, 4 quen, 5 VIP', () => {
    const tierOf = (n: number) => classifyCustomer({ validOrders: n, totalSpent: 0, lastOrderAt: daysAgo(1) }, T, now).tier;
    expect([tierOf(1), tierOf(2), tierOf(4), tierOf(5)]).toEqual(['NEW', 'RETURNING', 'RETURNING', 'VIP']);
  });

  it('ranh giới hoạt động: 60 ngày còn ACTIVE, 61 là AT_RISK, 120 còn AT_RISK, 121 là CHURNED', () => {
    const act = (d: number) => classifyCustomer({ validOrders: 1, totalSpent: 0, lastOrderAt: daysAgo(d) }, T, now).activity;
    expect([act(60), act(61), act(120), act(121)]).toEqual(['ACTIVE', 'AT_RISK', 'AT_RISK', 'CHURNED']);
  });

  it('khách chưa có đơn hợp lệ: NONE', () => {
    expect(classifyCustomer({ validOrders: 0, totalSpent: 0, lastOrderAt: null }, T, now)).toEqual({ tier: 'NEW', activity: 'NONE' });
  });
});

describe('thresholdsFromSettings', () => {
  it('đọc đúng ngưỡng từ dữ liệu cấu hình mẫu', () => {
    expect(thresholdsFromSettings(CUSTOMER_SETTINGS)).toEqual(T);
  });

  it('thiếu, sai kiểu hoặc phi lý thì báo lỗi rõ ràng', () => {
    expect(() => thresholdsFromSettings(CUSTOMER_SETTINGS.filter((s) => s.key !== 'segment.vip_min_spend'))).toThrow(/segment\.vip_min_spend/);
    expect(() => thresholdsFromSettings(CUSTOMER_SETTINGS.map((s) => (s.key === 'activity.active_days' ? { ...s, value: '60' } : s)))).toThrow(/activity\.active_days/);
    expect(() => thresholdsFromSettings(CUSTOMER_SETTINGS.map((s) => (s.key === 'activity.at_risk_days' ? { ...s, value: 30 } : s)))).toThrow(/lớn hơn/);
  });
});
