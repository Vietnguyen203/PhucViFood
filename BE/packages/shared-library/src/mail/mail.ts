import nodemailer, { type Transporter } from 'nodemailer';

/** Một thư gửi đi: có cả bản văn bản thường (cho ứng dụng thư không hiện HTML) và bản HTML. */
export interface MailMessage { to: string; subject: string; text: string; html: string }

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

export type MailTransport = 'smtp' | 'log' | 'memory';

export interface MailConfig {
  /** smtp: gửi thật qua SMTP; log: chỉ in nội dung thư ra log (không gửi); memory: giữ trong bộ nhớ (dùng cho test). */
  transport: MailTransport;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  /** Người gửi hiển thị, vd `Phúc Vị Foods <no-reply@phucvifoods.vn>`. */
  from: string;
  /** Địa chỉ gốc của cửa hàng, dùng làm link trong thư (vd https://phucvifoods.vn). Không có dấu / ở cuối. */
  publicBaseUrl: string;
}

type Env = Record<string, string | undefined>;

/** Đọc cấu hình thư từ biến môi trường; sai thì ghi vào `problems` để service báo một lượt khi khởi động. */
export function readMailConfig(env: Env, problems: string[]): MailConfig {
  const transport = (env.MAIL_TRANSPORT ?? 'log') as MailTransport;
  if (!['smtp', 'log', 'memory'].includes(transport)) problems.push('MAIL_TRANSPORT phải là smtp, log hoặc memory');
  const port = Number(env.SMTP_PORT ?? 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('SMTP_PORT phải là số nguyên từ 1 đến 65535');
  const publicBaseUrl = (env.PUBLIC_BASE_URL ?? 'http://localhost:8443').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(publicBaseUrl)) problems.push('PUBLIC_BASE_URL phải là địa chỉ http(s)');
  const user = env.SMTP_USER?.trim() || null;
  const pass = env.SMTP_PASS ?? null;
  if (transport === 'smtp' && !env.SMTP_HOST) problems.push('Thiếu SMTP_HOST khi MAIL_TRANSPORT=smtp');
  if ((user && !pass) || (!user && pass)) problems.push('SMTP_USER và SMTP_PASS phải đi cùng nhau');
  return {
    transport, host: env.SMTP_HOST ?? 'localhost', port, secure: env.SMTP_SECURE === 'true', user, pass,
    from: env.MAIL_FROM?.trim() || 'Phúc Vị Foods <no-reply@phucvifoods.vn>', publicBaseUrl,
  };
}

/** Gửi thật qua SMTP. Nhận `transporter` để test thay bằng bộ giả. */
export class SmtpMailer implements Mailer {
  constructor(private readonly from: string, private readonly transporter: Transporter) {}

  static fromConfig(c: MailConfig): SmtpMailer {
    const transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      ...(c.user && c.pass ? { auth: { user: c.user, pass: c.pass } } : {}),
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
    return new SmtpMailer(c.from, transporter);
  }

  async send(m: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
  }
}

/** Không gửi: in tiêu đề và nội dung văn bản ra log. Dùng khi chưa cấu hình SMTP. */
export class LogMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = (l) => console.log(l)) {}
  async send(m: MailMessage): Promise<void> {
    this.log(`[mail] tới ${m.to} | ${m.subject}\n${m.text}`);
  }
}

/** Giữ thư trong bộ nhớ để test kiểm tra. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(m: MailMessage): Promise<void> { this.sent.push(m); }
  to(address: string): MailMessage[] { return this.sent.filter((m) => m.to.toLowerCase() === address.toLowerCase()); }
}

export function createMailer(c: MailConfig): Mailer {
  if (c.transport === 'smtp') return SmtpMailer.fromConfig(c);
  if (c.transport === 'memory') return new MemoryMailer();
  return new LogMailer();
}

/**
 * Gửi thư mà KHÔNG làm hỏng việc chính: lỗi (SMTP chết, địa chỉ sai) chỉ ghi log. Dùng cho thư phụ như xác nhận đơn.
 * Trả true nếu gửi được.
 */
export async function sendSafely(mailer: Mailer, message: MailMessage, onError: (e: unknown) => void): Promise<boolean> {
  try { await mailer.send(message); return true; } catch (e) { onError(e); return false; }
}
