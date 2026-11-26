import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AFFILIATE_TRANSITIONS } from '../../src/affiliates/affiliates.service';
import { ApproveDto, CreateProfileDto } from '../../src/affiliates/dto';
import { loadConfig } from '../../src/config/app-config';
import { generateJwtKeyPair } from '@phucvi/shared-library/auth';

/** Cặp khóa riêng của file test: service chỉ nhận khóa công khai, test giữ khóa riêng để ký token thay cho user service. */
const KEYS = generateJwtKeyPair();

const env = {
  AFFILIATE_DATABASE_URL: 'postgresql://x', RABBITMQ_URL: 'amqp://x',
  JWT_PUBLIC_KEY: KEYS.publicKey, INTERNAL_API_KEY: 'k'.repeat(24),
};

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ với giá trị mặc định', () => {
    const c = loadConfig(env);
    expect(c).toMatchObject({ port: 3002, eventQueue: 'affiliate.commission', relayEnabled: true });
    expect(c.jwt.accessTtlSeconds).toBe(900);
  });

  it('báo tất cả lỗi một lượt', () => {
    expect(() => loadConfig({ JWT_ACCESS_SECRET: 'ngan', INTERNAL_API_KEY: 'x', PORT: '0' })).toThrowError(
      /AFFILIATE_DATABASE_URL[\s\S]*RABBITMQ_URL[\s\S]*INTERNAL_API_KEY[\s\S]*PORT[\s\S]*JWT_PUBLIC_KEY/,
    );
  });
});

describe('luồng trạng thái CTV', () => {
  it('PENDING -> ACTIVE/REJECTED; ACTIVE <-> SUSPENDED; REJECTED là cuối', () => {
    expect(AFFILIATE_TRANSITIONS.PENDING).toEqual(['ACTIVE', 'REJECTED']);
    expect(AFFILIATE_TRANSITIONS.ACTIVE).toEqual(['SUSPENDED']);
    expect(AFFILIATE_TRANSITIONS.SUSPENDED).toEqual(['ACTIVE']);
    expect(AFFILIATE_TRANSITIONS.REJECTED).toEqual([]);
  });
});

async function errorFields(dto: object): Promise<string[]> {
  return (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property).sort();
}
const make = <T extends object>(Cls: new () => T, data: Partial<T>): T => Object.assign(new Cls(), data);

describe('DTO hồ sơ CTV', () => {
  const ok = { fullName: 'Nguyễn Thị Linh', phone: '0912 345 678', referralCode: 'linh01' };

  it('hợp lệ', async () => {
    expect(await errorFields(make(CreateProfileDto, ok))).toEqual([]);
  });

  it.each([
    ['SĐT sai', { phone: '12345' }, 'phone'],
    ['mã quá ngắn', { referralCode: 'abc' }, 'referralCode'],
    ['mã có chữ hoa', { referralCode: 'Linh01' }, 'referralCode'],
    ['mã là từ khóa hệ thống', { referralCode: 'admin' }, 'referralCode'],
    ['họ tên quá ngắn', { fullName: 'A' }, 'fullName'],
    ['số tài khoản có chữ', { bankAccountNo: '12ab' }, 'bankAccountNo'],
  ])('từ chối: %s', async (_n, patch, field) => {
    expect(await errorFields(make(CreateProfileDto, { ...ok, ...patch } as never))).toContain(field);
  });
});

describe('DTO duyệt CTV', () => {
  it('ngày hợp đồng phải đúng định dạng và là ngày có thật', async () => {
    expect(await errorFields(make(ApproveDto, { contractStart: '2026-01-01', contractEnd: '2026-12-31', commissionRateBps: 1000 }))).toEqual([]);
    expect(await errorFields(make(ApproveDto, { contractStart: '2026-02-30' }))).toContain('contractStart');
    expect(await errorFields(make(ApproveDto, { contractStart: '01/01/2026' }))).toContain('contractStart');
    expect(await errorFields(make(ApproveDto, { contractStart: '2026-01-01', commissionRateBps: 10_001 }))).toContain('commissionRateBps');
    expect(await errorFields(make(ApproveDto, { contractStart: '2026-01-01', commissionRateBps: 10.5 }))).toContain('commissionRateBps');
  });
});
