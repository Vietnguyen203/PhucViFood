import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ContextCache, type ReferralContext } from '../../src/clients/affiliate.client';
import { loadConfig } from '../../src/config/app-config';
import { ClickDto, TrackEventDto } from '../../src/tracking/dto';
import { parseRange } from '../../src/tracking/tracking.service';
import { generateJwtKeyPair } from '@phucvi/shared-library/auth';

/** Cặp khóa riêng của file test: service chỉ nhận khóa công khai, test giữ khóa riêng để ký token thay cho user service. */
const KEYS = generateJwtKeyPair();

const env = { TRACKING_DATABASE_URL: 'postgresql://x', JWT_PUBLIC_KEY: KEYS.publicKey, INTERNAL_API_KEY: 'k'.repeat(24) };

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ với giá trị mặc định (cổng 3006, affiliate ở 3002)', () => {
    expect(loadConfig(env)).toMatchObject({ port: 3006, affiliateUrl: 'http://localhost:3002/api', downstreamTimeoutMs: 5000 });
  });
  it('không cần RabbitMQ (tracking không phát hay nhận sự kiện)', () => {
    expect(() => loadConfig(env)).not.toThrow();
  });
  it('báo tất cả lỗi một lượt', () => {
    expect(() => loadConfig({ INTERNAL_API_KEY: 'x', AFFILIATE_URL: 'khong-phai-url', PORT: '0' })).toThrowError(
      /TRACKING_DATABASE_URL[\s\S]*INTERNAL_API_KEY[\s\S]*PORT[\s\S]*AFFILIATE_URL[\s\S]*JWT_PUBLIC_KEY/,
    );
  });
});

describe('parseRange', () => {
  const now = new Date('2026-11-25T00:00:00Z');
  it('mặc định 30 ngày gần nhất', () => {
    const r = parseRange({}, now);
    expect(r.to).toEqual(now);
    expect(r.from).toEqual(new Date('2026-10-26T00:00:00Z'));
  });
  it('từ chối khoảng sai', () => {
    expect(() => parseRange({ from: 'hôm qua' }, now)).toThrow();
    expect(() => parseRange({ from: '2026-11-25', to: '2026-11-01' }, now)).toThrow();
    expect(() => parseRange({ from: '2024-01-01', to: '2026-11-01' }, now)).toThrow(); // quá 366 ngày
  });
});

describe('ContextCache', () => {
  const ok: ReferralContext = { valid: true, affiliateId: 'a', referralCode: 'linh01', linkId: null, cookieDays: 30 };
  const bad: ReferralContext = { valid: false };
  const make = () => {
    let t = 1_000;
    return { cache: new ContextCache(() => t), advance: (ms: number) => { t += ms; } };
  };

  it('nhớ kết quả hợp lệ 60 giây', () => {
    const { cache, advance } = make();
    cache.set('linh01|', ok);
    advance(59_999);
    expect(cache.get('linh01|')).toEqual(ok);
    advance(1);
    expect(cache.get('linh01|')).toBeUndefined();
  });
  it('mã không hợp lệ chỉ nhớ 10 giây (CTV vừa được duyệt không phải chờ lâu)', () => {
    const { cache, advance } = make();
    cache.set('abc|', bad);
    advance(9_999);
    expect(cache.get('abc|')).toEqual(bad);
    advance(1);
    expect(cache.get('abc|')).toBeUndefined();
  });
  it('mỗi cặp (mã, kênh) một mục riêng', () => {
    const { cache } = make();
    cache.set('linh01|tiktok', { ...ok, linkId: 'l1' });
    expect(cache.get('linh01|')).toBeUndefined();
  });
  it('giới hạn số mục, bỏ mục cũ nhất khi đầy', () => {
    const { cache } = make();
    for (let i = 0; i < 5_000; i++) cache.set(`m${i}|`, bad);
    cache.set('moi|', ok);
    expect(cache.size).toBe(5_000);
    expect(cache.get('m0|')).toBeUndefined();
    expect(cache.get('moi|')).toEqual(ok);
  });
});

describe('DTO', () => {
  const errors = async (Cls: new () => object, plain: object) => (await validate(plainToInstance(Cls, plain), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property).sort();
  const visitorId = '0191e2c0-aaaa-7bbb-8ccc-123456789abc';

  it('click hợp lệ; mã được đưa về chữ thường và bỏ khoảng trắng', async () => {
    expect(await errors(ClickDto, { code: ' LINH01 ', channel: 'TikTok', visitorId, landingPath: '/r/linh01?c=tiktok' })).toEqual([]);
    expect(plainToInstance(ClickDto, { code: ' LINH01 ', landingPath: '/r/x' }).code).toBe('linh01');
  });
  it.each([
    ['thiếu landingPath', { code: 'linh01' }, 'landingPath'],
    ['thiếu mã', { landingPath: '/r/x' }, 'code'],
    ['visitorId không phải UUID', { code: 'linh01', landingPath: '/r/x', visitorId: 'abc' }, 'visitorId'],
    ['landingPath quá dài', { code: 'linh01', landingPath: '/'.repeat(501) }, 'landingPath'],
    ['trường lạ', { code: 'linh01', landingPath: '/r/x', affiliateId: 'x' }, 'affiliateId'],
  ])('click từ chối: %s', async (_n, plain, field) => {
    expect(await errors(ClickDto, plain)).toContain(field);
  });

  it('sự kiện hợp lệ với 3 loại', async () => {
    for (const type of ['PRODUCT_VIEW', 'ADD_TO_CART', 'CHECKOUT_START']) expect(await errors(TrackEventDto, { code: 'linh01', visitorId, type })).toEqual([]);
  });
  it.each([
    ['loại lạ', { code: 'linh01', visitorId, type: 'HACK' }, 'type'],
    ['thiếu visitorId', { code: 'linh01', type: 'PRODUCT_VIEW' }, 'visitorId'],
    ['productId không phải UUID', { code: 'linh01', visitorId, type: 'PRODUCT_VIEW', productId: '1' }, 'productId'],
  ])('sự kiện từ chối: %s', async (_n, plain, field) => {
    expect(await errors(TrackEventDto, plain)).toContain(field);
  });
});
