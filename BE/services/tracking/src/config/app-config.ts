import { readJwtConfig, type JwtConfig } from '@phucvi/shared-library/auth';
import { readResilienceEnv, type ResilienceConfig } from '@phucvi/shared-library/http';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  jwt: JwtConfig;
  /** Khóa gọi API nội bộ của affiliate (kiểm tra mã CTV, tra CTV theo tài khoản). */
  internalApiKey: string;
  affiliateUrl: string;
  /** Thời gian chờ tối đa mỗi lần gọi affiliate (ms). */
  downstreamTimeoutMs: number;
  /** Retry và ngắt mạch khi gọi affiliate. */
  downstreamResilience: ResilienceConfig;
}

type Env = Record<string, string | undefined>;

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.TRACKING_DATABASE_URL) problems.push('Thiếu TRACKING_DATABASE_URL');
  const internalKey = env.INTERNAL_API_KEY ?? '';
  if (internalKey.length < 24) problems.push('INTERNAL_API_KEY phải có ít nhất 24 ký tự');

  const port = Number(env.PORT ?? '3006');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT phải là số nguyên từ 1 đến 65535');
  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60) problems.push('ACCESS_TOKEN_TTL_SECONDS phải là số nguyên từ 60');
  const timeout = Number(env.DOWNSTREAM_TIMEOUT_MS ?? 5000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) problems.push('DOWNSTREAM_TIMEOUT_MS phải là số nguyên từ 100 đến 60000');
  const downstreamResilience = readResilienceEnv(env, problems);
  const affiliateUrl = (env.AFFILIATE_URL ?? 'http://localhost:3002/api').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(affiliateUrl)) problems.push('AFFILIATE_URL phải là địa chỉ http(s)');

  // Chỉ kiểm tra token nên chỉ cần khóa công khai (khóa riêng nằm ở user service).
  const jwt = readJwtConfig(env, 'verify', ttl, problems);

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);

  return {
    port,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    jwt,
    internalApiKey: internalKey,
    affiliateUrl,
    downstreamTimeoutMs: timeout,
    downstreamResilience,
  };
}
