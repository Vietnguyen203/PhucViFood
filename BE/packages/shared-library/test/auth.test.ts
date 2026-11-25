import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppException, createHealthController, setupApp } from '../src/api';
import {
  AuthGuardsModule, CurrentUser, extractBearerToken, Public, Roles, signAccessToken, verifyAccessToken,
  type AuthUser, type JwtConfig,
} from '../src/auth';

const config: JwtConfig = { secret: 'test-secret-test-secret-test-secret-123', issuer: 'phucvi-test', accessTtlSeconds: 60 };
const admin: AuthUser = { id: '01930000-0000-7000-8000-000000001001', email: 'admin@example.com', role: 'ADMIN' };
const affiliate: AuthUser = { id: '01930000-0000-7000-8000-000000001002', email: 'ctv@example.com', role: 'AFFILIATE' };

function expectUnauthorized(fn: () => unknown) {
  try { fn(); expect.unreachable(); } catch (e) {
    expect(e).toBeInstanceOf(AppException);
    expect((e as AppException).code).toBe('UNAUTHORIZED');
  }
}

describe('JWT access token', () => {
  it('ký rồi kiểm tra lại ra đúng người dùng', () => {
    expect(verifyAccessToken(signAccessToken(admin, config), config)).toEqual(admin);
  });

  it('từ chối token hết hạn', () => {
    const expired = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, config.secret, {
      algorithm: 'HS256', issuer: config.issuer, expiresIn: -60,
    });
    expectUnauthorized(() => verifyAccessToken(expired, config));
  });

  it('từ chối token bị sửa nội dung hoặc ký bằng khóa khác', () => {
    const token = signAccessToken(affiliate, config);
    const [h, , s] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: affiliate.id, email: affiliate.email, role: 'ADMIN', iss: config.issuer })).toString('base64url');
    expectUnauthorized(() => verifyAccessToken(`${h}.${forgedPayload}.${s}`, config));
    expectUnauthorized(() => verifyAccessToken(signAccessToken(admin, { ...config, secret: 'khac-khac-khac-khac-khac-khac-khac-1' }), config));
  });

  it('từ chối alg "none" và thuật toán khác HS256', () => {
    const none = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN', iss: config.issuer }, '', { algorithm: 'none' });
    expectUnauthorized(() => verifyAccessToken(none, config));
    const hs512 = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, config.secret, { algorithm: 'HS512', issuer: config.issuer });
    expectUnauthorized(() => verifyAccessToken(hs512, config));
  });

  it('từ chối sai issuer, sai vai trò, thiếu trường, chuỗi rác', () => {
    expectUnauthorized(() => verifyAccessToken(signAccessToken(admin, { ...config, issuer: 'noi-khac' }), config));
    const badRole = jwt.sign({ sub: admin.id, email: admin.email, role: 'SUPERUSER' }, config.secret, { algorithm: 'HS256', issuer: config.issuer });
    expectUnauthorized(() => verifyAccessToken(badRole, config));
    const noSub = jwt.sign({ email: admin.email, role: 'ADMIN' }, config.secret, { algorithm: 'HS256', issuer: config.issuer });
    expectUnauthorized(() => verifyAccessToken(noSub, config));
    expectUnauthorized(() => verifyAccessToken('khong.phai.token', config));
  });

  it('từ chối cấu hình yếu', () => {
    expect(() => signAccessToken(admin, { ...config, secret: 'ngan' })).toThrow();
    expect(() => signAccessToken(admin, { ...config, accessTtlSeconds: 0 })).toThrow();
  });

  it('extractBearerToken', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });
});

@Controller('demo')
class DemoController {
  @Public() @Get('open') open() { return { open: true }; }
  @Get('private') priv(@CurrentUser() user: AuthUser) { return { id: user.id, role: user.role }; }
  @Roles('ADMIN') @Get('admin-only') adminOnly() { return { secret: 'ok' }; }
}

@Module({
  imports: [AuthGuardsModule.forRoot(config)],
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
    const expired = jwt.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' }, config.secret, { algorithm: 'HS256', issuer: config.issuer, expiresIn: -60 });
    expect((await get('/demo/private', expired)).status).toBe(401);
  });

  it('@Roles: ADMIN vào được, AFFILIATE bị 403', async () => {
    expect((await get('/demo/admin-only', signAccessToken(admin, config))).status).toBe(200);
    const r = await get('/demo/admin-only', signAccessToken(affiliate, config));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });
});
