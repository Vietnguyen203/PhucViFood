import { SERVICE_NAMES, type ServiceName } from '../proxy/routes';

export const APP_CONFIG = Symbol('GATEWAY_APP_CONFIG');

export interface RateLimitConfig {
  enabled: boolean;
  /** Mọi yêu cầu của một IP, mỗi phút. */
  globalPerMin: number;
  /** Đăng nhập, đăng ký, làm mới token. */
  authPerMin: number;
  /** API công khai ghi dữ liệu: tracking, click giới thiệu, tạo đơn. */
  publicWritePerMin: number;
  /** Tra cứu, hủy, xác nhận đơn bằng mã đơn (chống dò mã). */
  lookupPerMin: number;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  upstreams: Record<ServiceName, string>;
  /** Thời gian tối đa không có dữ liệu từ service phía sau trước khi báo 503. */
  proxyTimeoutMs: number;
  healthTimeoutMs: number;
  maxBodyBytes: number;
  /** Số proxy tin cậy đứng trước gateway (vd Caddy = 1). 0 = dùng địa chỉ kết nối trực tiếp. */
  trustProxyHops: number;
  rateLimit: RateLimitConfig;
}

const DEFAULT_URLS: Record<ServiceName, string> = {
  user: 'http://localhost:3001/api',
  affiliate: 'http://localhost:3002/api',
  catalog: 'http://localhost:3003/api',
  ordering: 'http://localhost:3004/api',
  customer: 'http://localhost:3005/api',
};

/** Đọc và kiểm tra cấu hình; gom mọi lỗi một lượt để sửa .env một lần. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const problems: string[] = [];
  const int = (name: string, def: number, min: number, max: number): number => {
    const n = Number(env[name] ?? def);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} phải là số nguyên từ ${min} đến ${max}`);
      return def;
    }
    return n;
  };

  const upstreams = {} as Record<ServiceName, string>;
  for (const name of SERVICE_NAMES) {
    const key = `${name.toUpperCase()}_URL`;
    const url = (env[key] ?? DEFAULT_URLS[name]).replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(url)) problems.push(`${key} phải là địa chỉ http(s)`);
    upstreams[name] = url;
  }

  const config: AppConfig = {
    // Biến riêng GATEWAY_PORT (không dùng PORT): .env dùng chung có PORT của service user, dễ đè nhầm cổng.
    port: int('GATEWAY_PORT', 3000, 1, 65535),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    upstreams,
    proxyTimeoutMs: int('PROXY_TIMEOUT_MS', 30_000, 100, 300_000),
    healthTimeoutMs: int('HEALTH_TIMEOUT_MS', 2_000, 100, 30_000),
    maxBodyBytes: int('MAX_BODY_BYTES', 1_048_576, 1_024, 50 * 1_048_576),
    trustProxyHops: int('TRUST_PROXY_HOPS', 0, 0, 10),
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED !== 'false',
      globalPerMin: int('RATE_LIMIT_PER_MIN', 300, 1, 100_000),
      authPerMin: int('RATE_LIMIT_AUTH_PER_MIN', 20, 1, 100_000),
      publicWritePerMin: int('RATE_LIMIT_PUBLIC_WRITE_PER_MIN', 30, 1, 100_000),
      lookupPerMin: int('RATE_LIMIT_LOOKUP_PER_MIN', 30, 1, 100_000),
    },
  };

  if (problems.length) throw new Error(`Cấu hình gateway không hợp lệ:\n- ${problems.join('\n- ')}`);
  return config;
}
