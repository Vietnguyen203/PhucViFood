import { generateJwtKeyPair, verifyAccessToken, signAccessToken } from '@phucvi/shared-library/auth';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/app-config';
import { passwordPolicyIssues } from '../../src/auth/password';
import { UserRoleCode, UserStatusCode } from '@phucvi/shared-library/contracts';
import { UsersService } from '../../src/users/users.service';

const KEYS = generateJwtKeyPair();

const validEnv = {
  USER_DATABASE_URL: 'postgresql://x', RABBITMQ_URL: 'amqp://x', JWT_PRIVATE_KEY: KEYS.privateKey,
};

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ, có giá trị mặc định', () => {
    const c = loadConfig(validEnv);
    expect(c).toMatchObject({ port: 3001, refreshTtlDays: 30, bcryptRounds: 12, maxFailedLogins: 5, relayEnabled: true });
    // User service là nơi ký: nhận khóa riêng, khóa công khai suy ra từ đó; token ký ra kiểm tra được bằng khóa công khai.
    expect(c.jwt).toMatchObject({ issuer: 'phucvi', accessTtlSeconds: 900, privateKey: KEYS.privateKey.trim() });
    const user = { id: '01930000-0000-7000-8000-000000001001', email: 'a@example.com', role: 'ADMIN' as const };
    expect(verifyAccessToken(signAccessToken(user, c.jwt), { publicKey: c.jwt.publicKey, issuer: c.jwt.issuer })).toEqual(user);
    expect(c.corsOrigins).toEqual(['http://localhost:5173']);
  });

  it('báo TẤT CẢ lỗi một lượt khi thiếu hoặc sai', () => {
    expect(() => loadConfig({ JWT_ACCESS_SECRET: 'cu', PORT: 'abc', BCRYPT_ROUNDS: '2' })).toThrowError(
      /USER_DATABASE_URL[\s\S]*RABBITMQ_URL[\s\S]*PORT[\s\S]*JWT_PRIVATE_KEY[\s\S]*BCRYPT_ROUNDS/,
    );
  });

  it('tắt relay bằng OUTBOX_RELAY_ENABLED=false và đọc danh sách CORS', () => {
    const c = loadConfig({ ...validEnv, OUTBOX_RELAY_ENABLED: 'false', CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(c.relayEnabled).toBe(false);
    expect(c.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
  });
});

describe('chính sách mật khẩu', () => {
  it('chấp nhận mật khẩu hợp lệ (kể cả tiếng Việt)', () => {
    expect(passwordPolicyIssues('Matkhau123')).toEqual([]);
    expect(passwordPolicyIssues('mậtkhẩu2026')).toEqual([]);
  });
  it.each([
    ['ngắn', 'Ab1'],
    ['không có số', 'chuoichucaiabc'],
    ['không có chữ', '1234567890'],
    ['quá 72 byte', 'a1'.repeat(40)],
  ])('từ chối: %s', (_n, pw) => expect(passwordPolicyIssues(pw).length).toBeGreaterThan(0));
});

describe('UsersService: không cho mất quản trị viên cuối cùng', () => {
  // DB lưu mã số: role 1 = ADMIN, status 1 = ACTIVE, status 2 = DISABLED.
  const adminRow = { id: 'u1', email: 'a@x.vn', role: UserRoleCode.ADMIN, status: UserStatusCode.ACTIVE, passwordHash: 'x', createdAt: new Date(), lastLoginAt: null };
  const make = (otherActiveAdmins: number) => {
    const prisma = {
      user: {
        findFirst: async () => adminRow,
        count: async () => otherActiveAdmins,
        update: async () => ({ ...adminRow, status: UserStatusCode.DISABLED }),
      },
      $transaction: async (fn: (tx: unknown) => unknown) => fn({ user: { update: async () => ({ ...adminRow, status: UserStatusCode.DISABLED }) }, refreshToken: { updateMany: async () => ({ count: 0 }) } }),
    };
    const tokens = { revokeAllForUser: async () => ({}) };
    return new UsersService(prisma as never, {} as never, tokens as never, {} as never);
  };
  const id = '01930000-0000-7000-8000-000000001001';

  it('vô hiệu hóa admin cuối cùng bị chặn', async () => {
    await expect(make(0).update(id, { status: 'DISABLED' })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it('hạ quyền admin cuối cùng cũng bị chặn', async () => {
    await expect(make(0).update(id, { role: 'AFFILIATE' })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' });
  });
  it('còn admin khác thì được phép', async () => {
    // Trả về bằng TÊN (DISABLED) dù DB lưu mã số 2.
    await expect(make(1).update(id, { status: 'DISABLED' })).resolves.toMatchObject({ role: 'ADMIN', status: 'DISABLED' });
  });
});
