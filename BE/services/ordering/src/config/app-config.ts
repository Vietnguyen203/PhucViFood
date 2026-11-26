import type { JwtConfig } from '@phucvi/shared-library/auth';
import { readResilienceEnv, type ResilienceConfig } from '@phucvi/shared-library/http';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  rabbitUrl: string;
  corsOrigins: string[];
  jwt: JwtConfig;
  /** Khóa gọi API nội bộ của catalog, affiliate, customer. */
  internalApiKey: string;
  catalogUrl: string;
  affiliateUrl: string;
  customerUrl: string;
  /** Thời gian chờ tối đa mỗi lần gọi service khác (ms). */
  downstreamTimeoutMs: number;
  /** Retry và ngắt mạch khi gọi service khác. */
  downstreamResilience: ResilienceConfig;
  /** Tắt relay outbox (dùng khi test hoặc chạy relay ở tiến trình riêng). */
  relayEnabled: boolean;
  /** Job tự hủy đơn chuyển khoản quá hạn thanh toán. */
  orderExpiryEnabled: boolean;
  orderExpiryIntervalMs: number;
}

type Env = Record<string, string | undefined>;

const isHttpUrl = (v: string) => /^https?:\/\/[^\s]+$/.test(v);

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.ORDERING_DATABASE_URL) problems.push('Thiếu ORDERING_DATABASE_URL');
  if (!env.RABBITMQ_URL) problems.push('Thiếu RABBITMQ_URL');
  const secret = env.JWT_ACCESS_SECRET ?? '';
  if (secret.length < 32) problems.push('JWT_ACCESS_SECRET phải có ít nhất 32 ký tự');
  const internalKey = env.INTERNAL_API_KEY ?? '';
  if (internalKey.length < 24) problems.push('INTERNAL_API_KEY phải có ít nhất 24 ký tự');

  const port = Number(env.PORT ?? '3004');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT phải là số nguyên từ 1 đến 65535');
  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60) problems.push('ACCESS_TOKEN_TTL_SECONDS phải là số nguyên từ 60');
  const timeout = Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) problems.push('DOWNSTREAM_TIMEOUT_MS phải là số nguyên từ 100 đến 60000');

  const downstreamResilience = readResilienceEnv(env, problems);
  const expiryInterval = Number(env.ORDER_EXPIRY_INTERVAL_MS ?? 60_000);
  if (!Number.isInteger(expiryInterval) || expiryInterval < 1_000 || expiryInterval > 3_600_000) problems.push('ORDER_EXPIRY_INTERVAL_MS phải là số nguyên từ 1000 đến 3600000');

  const url = (key: string, fallback: string): string => {
    const raw = (env[key] ?? fallback).replace(/\/+$/, '');
    if (!isHttpUrl(raw)) problems.push(`${key} phải là địa chỉ http(s)`);
    return raw;
  };
  const catalogUrl = url('CATALOG_URL', 'http://localhost:3003/api');
  const affiliateUrl = url('AFFILIATE_URL', 'http://localhost:3002/api');
  const customerUrl = url('CUSTOMER_URL', 'http://localhost:3005/api');

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);

  return {
    port,
    rabbitUrl: env.RABBITMQ_URL ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    jwt: { secret, issuer: env.JWT_ISSUER ?? 'phucvi', accessTtlSeconds: ttl },
    internalApiKey: internalKey,
    catalogUrl, affiliateUrl, customerUrl,
    downstreamTimeoutMs: timeout,
    downstreamResilience,
    relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
    orderExpiryEnabled: env.ORDER_EXPIRY_ENABLED !== 'false',
    orderExpiryIntervalMs: expiryInterval,
  };
}
