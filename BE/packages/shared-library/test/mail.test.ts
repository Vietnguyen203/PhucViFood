import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { createMailer, emailButton, emailLayout, escapeHtml, formatVnd, LogMailer, MemoryMailer, readMailConfig, sendSafely, SmtpMailer } from '../src/mail';

const msg = { to: 'a@b.vn', subject: 'Chủ đề', text: 'nội dung', html: '<p>nội dung</p>' };

describe('cấu hình thư', () => {
  it('mặc định: ghi log, SMTP localhost:1025, địa chỉ cửa hàng localhost', () => {
    const problems: string[] = [];
    const c = readMailConfig({}, problems);
    expect(problems).toEqual([]);
    expect(c).toMatchObject({ transport: 'log', host: 'localhost', port: 1025, secure: false, user: null, publicBaseUrl: 'http://localhost:8443' });
    expect(c.from).toContain('Phúc Vị Foods');
  });
  it('đọc đủ biến SMTP, bỏ dấu / cuối của PUBLIC_BASE_URL', () => {
    const problems: string[] = [];
    const c = readMailConfig({ MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.x.vn', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_SECURE: 'true', PUBLIC_BASE_URL: 'https://phucvifoods.vn///', MAIL_FROM: 'A <a@x.vn>' }, problems);
    expect(problems).toEqual([]);
    expect(c).toMatchObject({ transport: 'smtp', host: 'smtp.x.vn', port: 587, secure: true, user: 'u', pass: 'p', publicBaseUrl: 'https://phucvifoods.vn', from: 'A <a@x.vn>' });
  });
  it('báo mọi lỗi một lượt', () => {
    const problems: string[] = [];
    readMailConfig({ MAIL_TRANSPORT: 'pigeon', SMTP_PORT: '99999', PUBLIC_BASE_URL: 'ftp://x', SMTP_USER: 'u' }, problems);
    expect(problems).toHaveLength(3 + 1); // transport, port, url, user thiếu pass
    expect(readMailConfig({ MAIL_TRANSPORT: 'smtp' }, (problems.length = 0, problems))).toBeDefined();
    expect(problems).toContain('Thiếu SMTP_HOST khi MAIL_TRANSPORT=smtp');
  });
});

describe('gửi thư', () => {
  it('SMTP: gọi transporter với người gửi, người nhận, văn bản và HTML', async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transporter, 'sendMail');
    await new SmtpMailer('Phúc Vị <no-reply@x.vn>', transporter).send(msg);
    expect(spy).toHaveBeenCalledWith({ from: 'Phúc Vị <no-reply@x.vn>', to: 'a@b.vn', subject: 'Chủ đề', text: 'nội dung', html: '<p>nội dung</p>' });
  });
  it('log và bộ nhớ không gửi ra ngoài', async () => {
    const lines: string[] = [];
    await new LogMailer((l) => lines.push(l)).send(msg);
    expect(lines[0]).toContain('a@b.vn');
    const mem = new MemoryMailer();
    await mem.send(msg);
    expect(mem.to('A@B.VN')).toHaveLength(1);
    expect(mem.to('khac@b.vn')).toHaveLength(0);
  });
  it('createMailer chọn đúng loại', () => {
    const base = readMailConfig({}, []);
    expect(createMailer({ ...base, transport: 'log' })).toBeInstanceOf(LogMailer);
    expect(createMailer({ ...base, transport: 'memory' })).toBeInstanceOf(MemoryMailer);
    expect(createMailer({ ...base, transport: 'smtp' })).toBeInstanceOf(SmtpMailer);
  });
  it('sendSafely nuốt lỗi và báo qua onError, thành công trả true', async () => {
    const errors: unknown[] = [];
    const bad = { send: async () => { throw new Error('SMTP chết'); } };
    expect(await sendSafely(bad, msg, (e) => errors.push(e))).toBe(false);
    expect((errors[0] as Error).message).toBe('SMTP chết');
    expect(await sendSafely(new MemoryMailer(), msg, () => {})).toBe(true);
  });
});

describe('mẫu thư', () => {
  it('thoát HTML cho dữ liệu người dùng', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(12)).toBe('12');
  });
  it('định dạng tiền Việt', () => {
    expect(formatVnd(1234000)).toBe('1.234.000₫');
    expect(formatVnd(0n)).toBe('0₫');
  });
  it('khung thư thoát tiêu đề; nút chỉ nhận http(s)', () => {
    expect(emailLayout({ title: '<b>Đơn</b>', bodyHtml: '<p>x</p>' })).toContain('&lt;b&gt;Đơn&lt;/b&gt;');
    expect(emailButton('https://shop.vn/a?b=1&c=2', 'Xem')).toContain('href="https://shop.vn/a?b=1&amp;c=2"');
    expect(emailButton('javascript:alert(1)', 'Xấu')).toBe('');
  });
});
