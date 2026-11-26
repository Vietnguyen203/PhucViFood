import { generateKeyPairSync } from 'node:crypto';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppException, createHealthController, setupApp } from '../src/api';
import {
  assertJwtConfig, AuthGuardsModule, CurrentUser, extractBearerToken, generateJwtKeyPair, Public, readJwtConfig, Roles, signAccessToken, verifyAccessToken,
  type AuthUser, type JwtConfig,
} from '../src/auth';

const keys = generateJwtKeyPair();
const otherKeys = generateJwtKeyPair();
/** Cấu hình của user service (ký được) và của service khác (chỉ kiểm tra). */
const config: JwtConfig = { publicKey: keys.publicKey, privateKey: keys.privateKey, issuer: 'phucvi-test', accessTtlSeconds: 60 };
const verifyOnly: JwtConfig = { publicKey: keys.publicKey, issuer: 'phucvi-test', accessTtlSeconds: 60 };
const admin: AuthUser = { id: '01930000-0000-7000-8000-000000001001', email: 'admin@example.com', role: 'ADMIN' };
const affiliate: AuthUser = { id: '01930000-0000-7000-8000-000000001002', email: 'ctv@example.com', role: 'AFFILIATE' };
const rs = (payload: object, extra: jwt.SignOptions = {}, key = keys.privateKey) => jwt.sign(payload, key, { algorithm: 'RS256', issuer: config.issuer, ...extra });

function expectUnauthorized(fn: () => unknown) {
  try { fn(); expect.unreachable(); } catch (e) {
    expect(e).toBeInstanceOf(AppException);
    expect((e as AppException).code).toBe('UNAUTHORIZED');
  }
}

describe('JWT access token (RS256)', () => {
  it('user service ký, service khác chỉ có khóa công khai vẫn kiểm tra được', () => {
    expect(verifyAccessToken(signAccessToken(admin, config), verifyOnly)).toEqual(admin);
  });

  it('service chỉ có khóa công khai không ký được token', () => {
    expect(() => signAccessToken(admin, verifyOnly)).toThrow(/khóa riêng/);
  });

  it('từ chối token hết hạn', () => {
    expectUnauthorized(() => verifyAccessToken(rs({ sub: admin.id, email: admin.email, role: admin.role }, { expiresIn: -60 }), verifyOnly));
  });

  it('từ chối token bị sửa nội dung hoặc ký bằng cặp khóa khác', () => {
    const token = signAccessToken(affiliate, config);
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: affiliate.id, email: affiliate.email, role: 'ADMIN', iss: config.issuer })).toString('base64url');
    expectUnauthorized(() => verifyAccessToken(`${h}.${forgedPayload}.${s}`, verifyOnly));
    expectUnauthorized(() => verifyAccessToken(signAccessToken(admin, { ...config, ...otherKeys }), verifyOnly));
  });

  it('từ chối alg "none" và RS512', () => {
    const none = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN', iss: config.issuer }, '', { algorithm: 'none' });
    expectUnauthorized(() => verifyAccessToken(none, verifyOnly));
    const rs512 = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, keys.privateKey, { algorithm: 'RS512', issuer: config.issuer });
    expectUnauthorized(() => verifyAccessToken(rs512, verifyOnly));
  });

  it('chống tấn công đổi thuật toán: HS256 ký bằng chính khóa công khai làm bí mật bị từ chối', () => {
    const forged = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, keys.publicKey, { algorithm: 'HS256', issuer: config.issuer });
    expectUnauthorized(() => verifyAccessToken(forged, verifyOnly));
  });

  it('từ chối sai issuer, sai vai trò, thiếu trường, chuỗi rác', () => {
    expectUnauthorized(() => verifyAccessToken(signAccessToken(admin, { ...config, issuer: 'noi-khac' }), verifyOnly));
    expectUnauthorized(() => verifyAccessToken(rs({ sub: admin.id, email: admin.email, role: 'SUPERUSER' }), verifyOnly));
    expectUnauthorized(() => verifyAccessToken(rs({ email: admin.email, role: 'ADMIN' }), verifyOnly));
    expectUnauthorized(() => verifyAccessToken('khong.phai.token', verifyOnly));
  });

  it('từ chối cấu hình sai', () => {
    expect(() => signAccessToken(admin, { ...config, accessTtlSeconds: 0 })).toThrow();
    expect(() => signAccessToken(admin, { ...config, publicKey: otherKeys.publicKey })).toThrow(/không khớp/);
    expect(() => assertJwtConfig({ ...verifyOnly, publicKey: 'khong-phai-pem' })).toThrow(/không đọc được/);
    expect(() => assertJwtConfig({ ...verifyOnly, publicKey: '' })).toThrow(/Thiếu/);
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    expect(() => assertJwtConfig({ ...verifyOnly, publicKey: weak.publicKey })).toThrow(/2048/);
  });

  it('extractBearerToken', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});

describe('Đọc cấu hình JWT từ môi trường', () => {
  const b64 = (pem: string) => Buffer.from(pem).toString('base64');
  /** PEM một dòng với `\n` dạng chữ, như khi đặt trong .env. */
  const escaped = (pem: string) => pem.trim().split('\n').join('\\n');

  it('service kiểm tra: chỉ cần JWT_PUBLIC_KEY, bỏ qua khóa riêng nếu môi trường có', () => {
    const problems: string[] = [];
    const c = readJwtConfig({ JWT_PUBLIC_KEY: keys.publicKey, JWT_PRIVATE_KEY: keys.privateKey, JWT_ISSUER: 'phucvi-test' }, 'verify', 900, problems);
    expect(problems).toEqual([]);
    expect(c.privateKey).toBeUndefined();
    expect(verifyAccessToken(signAccessToken(admin, config), c)).toEqual(admin);
  });

  it('user service: khóa công khai suy ra từ khóa riêng', () => {
    const problems: string[] = [];
    const c = readJwtConfig({ JWT_PRIVATE_KEY: keys.privateKey, JWT_ISSUER: 'phucvi-test' }, 'sign', 900, problems);
    expect(problems).toEqual([]);
    expect(verifyAccessToken(signAccessToken(admin, c), c)).toEqual(admin);
  });

  it('chấp nhận PEM dạng base64 một dòng và dạng \\n trong .env', () => {
    const p1: string[] = [];
    expect(readJwtConfig({ JWT_PUBLIC_KEY: b64(keys.publicKey) }, 'verify', 900, p1).publicKey).toBe(keys.publicKey.trim());
    expect(p1).toEqual([]);
    const p2: string[] = [];
    expect(readJwtConfig({ JWT_PUBLIC_KEY: escaped(keys.publicKey) }, 'verify', 900, p2).publicKey).toBe(keys.publicKey.trim());
    expect(p2).toEqual([]);
  });

  it('báo lỗi rõ: thiếu khóa (kèm nhắc biến cũ), khóa rác, JWT_PUBLIC_KEY không khớp khóa riêng', () => {
    const a: string[] = []; readJwtConfig({ JWT_ACCESS_SECRET: 'x'.repeat(40) }, 'verify', 900, a);
    expect(a[0]).toMatch(/Thiếu JWT_PUBLIC_KEY.*JWT_ACCESS_SECRET không còn/);
    const b: string[] = []; readJwtConfig({}, 'sign', 900, b);
    expect(b[0]).toMatch(/Thiếu JWT_PRIVATE_KEY/);
    const c: string[] = []; readJwtConfig({ JWT_PUBLIC_KEY: 'rac' }, 'verify', 900, c);
    expect(c).toHaveLength(1);
    const d: string[] = []; readJwtConfig({ JWT_PRIVATE_KEY: keys.privateKey, JWT_PUBLIC_KEY: otherKeys.publicKey }, 'sign', 900, d);
    expect(d[0]).toMatch(/không khớp/);
  });
});

@Controller('demo')
class DemoController {
  @Public() @Get('open') open() { return { open: true }; }
  @Get('private') priv(@CurrentUser() user: AuthUser) { return { id: user.id, role: user.role }; }
  @Roles('ADMIN') @Get('admin-only') adminOnly() { return { secret: 'ok' }; }
}

@Module({
  imports: [AuthGuardsModule.forRoot(verifyOnly)],
  controllers: [DemoController, createHealthController('demo') as never],
})
class DemoModule {}

describe('Guard toàn cục (HTTP thật)', () => {
  let app: INestApplication;
  let base: string;
  const get = async (path: string, token?: string) => {
    const res = await fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: res.status, body: (await res.json()) as any };
  };

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [DemoModule] }).compile()).createNestApplication({ logger: false });
    setupApp(app);
    await app.listen(0);
    base = (await app.getUrl()).replace('[::1]', 'localhost');
  });
  afterAll(async () => { await app.close(); });

  it('route @Public và /health không cần token', async () => {
    expect((await get('/demo/open')).status).toBe(200);
    expect((await get('/health')).status).toBe(200);
  });

  it('mặc định mọi route cần token: thiếu token => 401 theo phong bì chuẩn', async () => {
    const r = await get('/demo/private');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('token đúng => vào được, CurrentUser đúng', async () => {
    const r = await get('/demo/private', signAccessToken(affiliate, config));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: affiliate.id, role: 'AFFILIATE' });
  });

  it('token sai/hết hạn => 401', async () => {
    expect((await get('/demo/private', 'rac')).status).toBe(401);
    const expired = rs({ sub: admin.id, email: admin.email, role: 'ADMIN' }, { expiresIn: -60 });
    expect((await get('/demo/private', expired)).status).toBe(401);
  });

  it('@Roles: ADMIN vào được, AFFILIATE bị 403', async () => {
    expect((await get('/demo/admin-only', signAccessToken(admin, config))).status).toBe(200);
    const r = await get('/demo/admin-only', signAccessToken(affiliate, config));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });
});
