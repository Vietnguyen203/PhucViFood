import type { JwtConfig } from '@phucvi/shared-library/auth';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  rabbitUrl: string;
  corsOrigins: string[];
  jwt: JwtConfig;
  /** Khóa dùng cho API nội bộ: ordering gọi customer, và customer gọi ordering. */
  internalApiKey: string;
  orderingUrl: string;
  /** Thời gian chờ tối đa mỗi lần gọi ordering (ms). */
  downstreamTimeoutMs: number;
  /** Tắt relay outbox (dùng khi test hoặc chạy relay ở tiến trình riêng). */
  relayEnabled: boolean;
}

type Env = Record<string, string | undefined>;

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.CUSTOMER_DATABASE_URL) problems.push('Thiếu CUSTOMER_DATABASE_URL');
  if (!env.RABBITMQ_URL) problems.push('Thiếu RABBITMQ_URL');
  const secret = env.JWT_ACCESS_SECRET ?? '';
  if (secret.length < 32) problems.push('JWT_ACCESS_SECRET phải có ít nhất 32 ký tự');
  const internalKey = env.INTERNAL_API_KEY ?? '';
  if (internalKey.length < 24) problems.push('INTERNAL_API_KEY phải có ít nhất 24 ký tự');

  const port = Number(env.PORT ?? '3005');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT phải là số nguyên từ 1 đến 65535');
  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60) problems.push('ACCESS_TOKEN_TTL_SECONDS phải là số nguyên từ 60');
  const timeout = Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) problems.push('DOWNSTREAM_TIMEOUT_MS phải là số nguyên từ 100 đến 60000');
  const orderingUrl = (env.ORDERING_URL ?? 'http://localhost:3004/api').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(orderingUrl)) problems.push('ORDERING_URL phải là địa chỉ http(s)');

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);

  return {
    port,
    rabbitUrl: env.RABBITMQ_URL ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    jwt: { secret, issuer: env.JWT_ISSUER ?? 'phucvi', accessTtlSeconds: ttl },
    internalApiKey: internalKey,
    orderingUrl,
    downstreamTimeoutMs: timeout,
    relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
  };
}
