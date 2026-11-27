// Test tích hợp service user: Postgres (user_db) + RabbitMQ thật, gọi API qua HTTP thật.
// Chạy: pnpm --filter @phucvi/user test:integration
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupApp } from '@phucvi/shared-library/api';
import { UserRoleCode, UserStatusCode } from '@phucvi/shared-library/contracts';
import { hashSync } from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { generateJwtKeyPair } from '@phucvi/shared-library/auth';
import { loadConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/prisma/prisma.service';

const enabled = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!enabled)('service user: đăng nhập JWT (HTTP thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;

  const PASSWORD = 'Matkhau2026';
  const uniq = () => `it-${Math.random().toString(36).slice(2, 10)}@example.com`;

  async function call(method: string, path: string, body?: unknown, token?: string) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  const register = async (email = uniq(), password = PASSWORD) => {
    const r = await call('POST', '/auth/register', { email, password });
    expect(r.status).toBe(201);
    return { email, ...r.body.data } as { email: string; user: any; accessToken: string; refreshToken: string };
  };
  const login = (email: string, password = PASSWORD) => call('POST', '/auth/login', { email, password });

  /** Tạo ADMIN trực tiếp trong DB rồi đăng nhập qua API. */
  async function adminSession() {
    const email = uniq();
    await prisma.user.create({ data: { email, passwordHash: hashSync(PASSWORD, 4), role: UserRoleCode.ADMIN } });
    const r = await login(email);
    expect(r.status).toBe(200);
    return { email, token: r.body.data.accessToken as string };
  }

  beforeAll(async () => {
    const config = loadConfig({
      USER_DATABASE_URL: process.env.USER_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/user_db',
      RABBITMQ_URL: process.env.RABBITMQ_URL ?? 'amqp://phucvi:phucvi@localhost:5672',
      JWT_PRIVATE_KEY: generateJwtKeyPair().privateKey,
      JWT_ISSUER: 'phucvi-it', BCRYPT_ROUNDS: '4', MAX_FAILED_LOGINS: '3', LOGIN_LOCK_MINUTES: '15',
      OUTBOX_RELAY_ENABLED: 'false',
    });
    process.env.USER_DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5433/user_db';
    app = await NestFactory.create(AppModule.forRoot(config), { logger: false });
    setupApp(app, { globalPrefix: 'api' });
    await app.listen(0);
    base = `${(await app.getUrl()).replace('[::1]', 'localhost')}/api`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "user".outbox_events WHERE payload->'payload'->>'email' LIKE 'it-%@example.com'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "user".users WHERE email LIKE 'it-%@example.com'`);
    await app.close();
  });

  describe('đăng ký', () => {
    it('tạo tài khoản AFFILIATE, trả token, không lộ băm mật khẩu, ghi sự kiện vào outbox', async () => {
      const email = uniq().toUpperCase(); // email được chuẩn hóa về chữ thường
      const r = await call('POST', '/auth/register', { email: `  ${email} `, password: PASSWORD });
      expect(r.status).toBe(201);
      const d = r.body.data;
      expect(d.user).toMatchObject({ email: email.toLowerCase(), role: 'AFFILIATE', status: 'ACTIVE' });
      expect(d.accessToken.split('.')).toHaveLength(3);
      expect(d.refreshToken.length).toBeGreaterThan(40);
      expect(d.tokenType).toBe('Bearer');
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);

      const rows = await prisma.$queryRawUnsafe<Array<{ event_type: string; published_at: Date | null }>>(
        `SELECT event_type, published_at FROM "user".outbox_events WHERE aggregate_id = $1::uuid`, d.user.id,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event_type: 'user.user.created', published_at: null });
    });

    it('email trùng => 409; mật khẩu yếu hoặc email sai => 400 kèm chi tiết', async () => {
      const { email } = await register();
      const dup = await call('POST', '/auth/register', { email, password: PASSWORD });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('CONFLICT');

      const weak = await call('POST', '/auth/register', { email: uniq(), password: 'abc' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.details[0].field).toBe('password');

      const badMail = await call('POST', '/auth/register', { email: 'khong-phai-email', password: PASSWORD });
      expect(badMail.status).toBe(400);
    });

    it('không thể tự đăng ký làm ADMIN bằng cách gửi thêm trường role', async () => {
      const r = await call('POST', '/auth/register', { email: uniq(), password: PASSWORD, role: 'ADMIN' });
      expect(r.status).toBe(400);
    });
  });

  describe('đăng ký khách mua hàng', () => {
    const registerCustomer = (body: Record<string, unknown>) => call('POST', '/auth/register-customer', body);

    it('tạo tài khoản CUSTOMER kèm họ tên, trả token, đăng nhập được, ghi sự kiện vào outbox', async () => {
      const email = uniq();
      const r = await registerCustomer({ email, password: PASSWORD, fullName: '  Nguyễn   Văn  A ' });
      expect(r.status).toBe(201);
      expect(r.body.data.user).toMatchObject({ email, role: 'CUSTOMER', status: 'ACTIVE', fullName: 'Nguyễn Văn A' });
      expect(r.body.data.user.passwordHash).toBeUndefined();
      expect(r.body.data.accessToken.split('.')).toHaveLength(3);
      const claims = JSON.parse(Buffer.from(r.body.data.accessToken.split('.')[1], 'base64url').toString());
      expect(claims.role).toBe('CUSTOMER');
      expect((await login(email)).body.data.user.role).toBe('CUSTOMER');
      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.role).toBe(UserRoleCode.CUSTOMER); // DB lưu mã số
      const ev = await prisma.outboxEvent.findFirst({ where: { aggregateId: row.id } });
      expect(ev?.eventType).toBe('user.user.created');
    });

    it('từ chối: email trùng (409), mật khẩu yếu, thiếu hoặc quá ngắn họ tên, email sai (400), gửi thêm role', async () => {
      const email = uniq();
      expect((await registerCustomer({ email, password: PASSWORD, fullName: 'Khách A' })).status).toBe(201);
      expect((await registerCustomer({ email: email.toUpperCase(), password: PASSWORD, fullName: 'Khách A' })).status).toBe(409);
      for (const body of [
        { email: uniq(), password: '123', fullName: 'Khách A' },
        { email: uniq(), password: PASSWORD },
        { email: uniq(), password: PASSWORD, fullName: 'A' },
        { email: 'khong-phai-email', password: PASSWORD, fullName: 'Khách A' },
        { email: uniq(), password: PASSWORD, fullName: 'Khách A', role: 'ADMIN' },
      ]) expect((await registerCustomer(body)).status, JSON.stringify(body)).toBe(400);
    });

    it('khách xem và đổi họ tên của mình; không vào được API quản trị người dùng', async () => {
      const s = (await registerCustomer({ email: uniq(), password: PASSWORD, fullName: 'Khách Cũ' })).body.data;
      expect((await call('GET', '/auth/me', undefined, s.accessToken)).body.data.fullName).toBe('Khách Cũ');
      const upd = await call('PATCH', '/auth/me', { fullName: 'Khách Mới' }, s.accessToken);
      expect(upd.status).toBe(200);
      expect(upd.body.data).toMatchObject({ fullName: 'Khách Mới', role: 'CUSTOMER' });
      expect((await call('PATCH', '/auth/me', { fullName: 'A' }, s.accessToken)).status).toBe(400);
      expect((await call('PATCH', '/auth/me', { fullName: 'Tên hợp lệ' })).status).toBe(401);
      expect((await call('GET', '/users', undefined, s.accessToken)).status).toBe(403);
    });

    it('admin lọc được danh sách khách và tạo tài khoản CUSTOMER', async () => {
      const admin = await adminSession();
      const email = uniq();
      await registerCustomer({ email, password: PASSWORD, fullName: 'Khách Lọc' });
      const list = await call('GET', `/users?filter[role]=CUSTOMER&q=${encodeURIComponent(email)}`, undefined, admin.token);
      expect(list.status).toBe(200);
      expect(list.body.data.map((u: any) => u.email)).toEqual([email]);
      const created = await call('POST', '/users', { email: uniq(), password: PASSWORD, role: 'CUSTOMER' }, admin.token);
      expect(created.status).toBe(201);
      expect(created.body.data.role).toBe('CUSTOMER');
    });
  });

  describe('đăng nhập', () => {
    it('đăng nhập đúng; email không phân biệt hoa thường; cập nhật lastLoginAt', async () => {
      const { email } = await register();
      const r = await login(email.toUpperCase());
      expect(r.status).toBe(200);
      expect(r.body.data.user.email).toBe(email);
      expect(r.body.data.user.lastLoginAt).toBeTruthy();
    });

    it('sai mật khẩu và email không tồn tại cho CÙNG một thông báo (không lộ email nào có tài khoản)', async () => {
      const { email } = await register();
      const wrongPw = await login(email, 'SaiMatKhau99');
      const noUser = await login(uniq(), PASSWORD);
      expect(wrongPw.status).toBe(401);
      expect(noUser.status).toBe(401);
      expect(wrongPw.body.error).toEqual(noUser.body.error);
    });

    it('nhập sai quá số lần cho phép => khóa tạm (429), kể cả khi sau đó nhập đúng; mở khóa thì đăng nhập lại được', async () => {
      const { email } = await register();
      for (let i = 0; i < 3; i++) expect((await login(email, 'SaiMatKhau99')).status).toBe(401);
      const locked = await login(email, PASSWORD);
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe('TOO_MANY_REQUESTS');

      await prisma.user.update({ where: { email }, data: { lockedUntil: new Date(Date.now() - 1000) } }); // hết hạn khóa
      expect((await login(email, PASSWORD)).status).toBe(200);
      expect((await prisma.user.findUnique({ where: { email } }))?.failedLoginAttempts).toBe(0);
    });

    it('tài khoản bị vô hiệu hóa: đúng mật khẩu vẫn bị 403', async () => {
      const { email } = await register();
      await prisma.user.update({ where: { email }, data: { status: UserStatusCode.DISABLED } });
      const r = await login(email);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('JWT và phân quyền', () => {
    it('/auth/me cần token; token đúng trả đúng người', async () => {
      expect((await call('GET', '/auth/me')).status).toBe(401);
      expect((await call('GET', '/auth/me', undefined, 'rac.rac.rac')).status).toBe(401);
      const s = await register();
      const me = await call('GET', '/auth/me', undefined, s.accessToken);
      expect(me.status).toBe(200);
      expect(me.body.data.email).toBe(s.email);
    });

    it('route mặc định yêu cầu đăng nhập; CTV không vào được API quản trị người dùng', async () => {
      expect((await call('GET', '/users')).status).toBe(401);
      const s = await register();
      const r = await call('GET', '/users', undefined, s.accessToken);
      expect(r.status).toBe(403);
      expect((await call('POST', '/users', { email: uniq(), password: PASSWORD, role: 'ADMIN' }, s.accessToken)).status).toBe(403);
    });

    it('/health công khai', async () => {
      const r = await call('GET', '/health');
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ status: 'ok', service: 'user' });
    });
  });

  describe('refresh token xoay vòng', () => {
    it('refresh cấp cặp mới; token cũ không dùng lại được; dùng lại token cũ thu hồi cả chuỗi', async () => {
      const s = await register();
      const r1 = await call('POST', '/auth/refresh', { refreshToken: s.refreshToken });
      expect(r1.status).toBe(200);
      const next = r1.body.data.refreshToken as string;
      expect(next).not.toBe(s.refreshToken);
      expect((await call('GET', '/auth/me', undefined, r1.body.data.accessToken)).status).toBe(200);

      // Kẻ trộm (hoặc client lỗi) dùng lại token cũ: bị từ chối và chuỗi bị thu hồi.
      const reuse = await call('POST', '/auth/refresh', { refreshToken: s.refreshToken });
      expect(reuse.status).toBe(401);
      // Token mới của người dùng thật cũng bị thu hồi, buộc đăng nhập lại.
      expect((await call('POST', '/auth/refresh', { refreshToken: next })).status).toBe(401);
      expect((await login(s.email)).status).toBe(200);
    });

    it('hai yêu cầu refresh song song cùng một token: chỉ một yêu cầu thành công', async () => {
      const s = await register();
      const results = await Promise.all([1, 2, 3].map(() => call('POST', '/auth/refresh', { refreshToken: s.refreshToken })));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(2);
    });

    it('refresh token sai hoặc hết hạn => 401', async () => {
      expect((await call('POST', '/auth/refresh', { refreshToken: 'x'.repeat(60) })).status).toBe(401);
      const s = await register();
      // CHECK expires_at > created_at bắt buộc hạn sau ngày tạo, nên mô phỏng token đã hết hạn bằng cách lùi cả hai mốc.
      await prisma.$executeRawUnsafe(`UPDATE "user".refresh_tokens SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE user_id = $1::uuid`, s.user.id);
      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
    });

    it('DB lưu role và status dạng số, API và JWT vẫn trả tên chuỗi', async () => {
      const s = await register();
      const row = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } });
      expect(row.role).toBe(UserRoleCode.AFFILIATE); // 2
      expect(row.status).toBe(UserStatusCode.ACTIVE); // 1
      const raw = await prisma.$queryRawUnsafe<Array<{ role: number; status: number }>>(
        `SELECT role, status FROM "user".users WHERE id = $1::uuid`, s.user.id,
      );
      expect(raw[0]).toEqual({ role: 2, status: 1 });
      expect(s.user).toMatchObject({ role: 'AFFILIATE', status: 'ACTIVE' });
      const claims = JSON.parse(Buffer.from(s.accessToken.split('.')[1], 'base64url').toString());
      expect(claims.role).toBe('AFFILIATE');
    });

    it('chỉ lưu băm SHA-256 của refresh token, không lưu token gốc', async () => {
      const s = await register();
      const rows = await prisma.refreshToken.findMany({ where: { userId: s.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].tokenHash).not.toBe(s.refreshToken);
    });
  });

  describe('đăng xuất và đổi mật khẩu', () => {
    it('logout thu hồi phiên; logout token rác vẫn trả 200', async () => {
      const s = await register();
      expect((await call('POST', '/auth/logout', { refreshToken: s.refreshToken })).status).toBe(200);
      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
      expect((await call('POST', '/auth/logout', { refreshToken: 'y'.repeat(60) })).status).toBe(200);
    });

    it('logout-all thu hồi mọi phiên của người dùng', async () => {
      const s = await register();
      const second = (await login(s.email)).body.data;
      expect((await call('POST', '/auth/logout-all', undefined, s.accessToken)).status).toBe(200);
      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
      expect((await call('POST', '/auth/refresh', { refreshToken: second.refreshToken })).status).toBe(401);
    });

    it('đổi mật khẩu: kiểm tra mật khẩu hiện tại, thu hồi phiên cũ, phiên hiện tại nhận token mới', async () => {
      const s = await register();
      const NEW = 'MatkhauMoi2027';
      const wrong = await call('POST', '/auth/change-password', { currentPassword: 'SaiRoi123', newPassword: NEW }, s.accessToken);
      expect(wrong.status).toBe(400);
      const same = await call('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: PASSWORD }, s.accessToken);
      expect(same.status).toBe(400);
      const weak = await call('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'yeu' }, s.accessToken);
      expect(weak.status).toBe(400);

      const ok = await call('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: NEW }, s.accessToken);
      expect(ok.status).toBe(200);
      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401); // phiên cũ
      expect((await call('POST', '/auth/refresh', { refreshToken: ok.body.data.refreshToken })).status).toBe(200); // phiên mới
      expect((await login(s.email, PASSWORD)).status).toBe(401);
      expect((await login(s.email, NEW)).status).toBe(200);
    });
  });

  describe('quản trị người dùng (ADMIN)', () => {
    it('tạo, xem, lọc, tìm kiếm, phân trang; không lộ băm mật khẩu', async () => {
      const admin = await adminSession();
      const email = uniq();
      const created = await call('POST', '/users', { email, password: PASSWORD, role: 'ADMIN' }, admin.token);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ email, role: 'ADMIN', status: 'ACTIVE' });
      expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

      const one = await call('GET', `/users/${created.body.data.id}`, undefined, admin.token);
      expect(one.body.data.email).toBe(email);

      const list = await call('GET', `/users?q=${encodeURIComponent(email)}&filter[role]=ADMIN&pageSize=5`, undefined, admin.token);
      expect(list.status).toBe(200);
      expect(list.body.data.map((u: any) => u.email)).toEqual([email]);
      expect(list.body.meta.pagination).toMatchObject({ page: 1, pageSize: 5, total: 1 });
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

      expect((await call('GET', '/users?sort=passwordHash', undefined, admin.token)).status).toBe(400);
      // Lọc bằng TÊN enum; gửi mã số thì bị từ chối.
      expect((await call('GET', '/users?filter[role]=2', undefined, admin.token)).status).toBe(400);
      const byRole = await call('GET', `/users?filter[role]=ADMIN&q=${encodeURIComponent(email)}`, undefined, admin.token);
      expect(byRole.body.data.map((u: any) => u.email)).toEqual([email]);
      expect((await call('GET', `/users?filter[role]=AFFILIATE&q=${encodeURIComponent(email)}`, undefined, admin.token)).body.data).toEqual([]);
      expect((await call('POST', '/users', { email, password: PASSWORD, role: 'ADMIN' }, admin.token)).status).toBe(409);
    });

    it('chỉ được đổi role và status (không đổi email/mật khẩu qua PATCH)', async () => {
      const admin = await adminSession();
      const s = await register();
      expect((await call('PATCH', `/users/${s.user.id}`, { email: uniq() }, admin.token)).status).toBe(400);
      expect((await call('PATCH', `/users/${s.user.id}`, { passwordHash: 'x' }, admin.token)).status).toBe(400);
      expect((await call('PATCH', `/users/${s.user.id}`, { status: 'LOCKED' }, admin.token)).status).toBe(400);
    });

    it('vô hiệu hóa người dùng: phiên bị thu hồi, access token cũ hết tác dụng ở /auth/me, không đăng nhập được', async () => {
      const admin = await adminSession();
      const s = await register();
      const r = await call('PATCH', `/users/${s.user.id}`, { status: 'DISABLED' }, admin.token);
      expect(r.status).toBe(200);
      expect(r.body.data.status).toBe('DISABLED');

      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
      expect((await call('GET', '/auth/me', undefined, s.accessToken)).status).toBe(401); // token còn hạn nhưng tài khoản đã khóa
      expect((await login(s.email)).status).toBe(403);

      const back = await call('PATCH', `/users/${s.user.id}`, { status: 'ACTIVE' }, admin.token);
      expect(back.status).toBe(200);
      expect((await login(s.email)).status).toBe(200);
    });

    it('admin đặt lại mật khẩu: đăng nhập được bằng mật khẩu mới, phiên cũ bị thu hồi, không đặt cho chính mình, CTV không được gọi', async () => {
      const admin = await adminSession();
      const s = await register();
      const fresh = 'Moi@Dat1Lai9';
      const r = await call('POST', `/users/${s.user.id}/reset-password`, { newPassword: fresh }, admin.token);
      expect(r.status).toBe(200);
      expect((await call('POST', '/auth/refresh', { refreshToken: s.refreshToken })).status).toBe(401);
      expect((await login(s.email)).status).toBe(401); // mật khẩu cũ không còn dùng được
      expect((await call('POST', '/auth/login', { email: s.email, password: fresh })).status).toBe(200);

      expect((await call('POST', `/users/${s.user.id}/reset-password`, { newPassword: '123' }, admin.token)).status).toBe(400);
      expect((await call('POST', `/users/${(await call('GET', '/auth/me', undefined, admin.token)).body.data.id}/reset-password`, { newPassword: fresh }, admin.token)).status).toBe(422);
      expect((await call('POST', `/users/${s.user.id}/reset-password`, { newPassword: fresh }, s.accessToken)).status).toBe(403);
      expect((await call('POST', '/users/khong-phai-uuid/reset-password', { newPassword: fresh }, admin.token)).status).toBe(400);
    });

    it('không có route xóa cứng người dùng', async () => {
      const admin = await adminSession();
      const s = await register();
      expect((await call('DELETE', `/users/${s.user.id}`, undefined, admin.token)).status).toBe(404);
    });
  });
});
