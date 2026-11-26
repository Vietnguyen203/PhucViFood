import type { JwtConfig } from '@phucvi/shared-library/auth';
import { readResilienceEnv, type ResilienceConfig } from '@phucvi/shared-library/http';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  rabbitUrl: string;
  corsOrigins: string[];
  jwt: JwtConfig;
  /** Khóa dùng cho API nội bộ giữa các service (ordering gọi giữ hàng, trả hàng). */
  internalApiKey: string;
  /** Queue nhận sự kiện đơn hàng để trả hàng khi đơn bị hủy. */
  eventQueue: string;
  /** Tắt relay outbox (dùng khi test hoặc chạy relay ở tiến trình riêng). */
  relayEnabled: boolean;
  /** Địa chỉ ordering, để hỏi đơn nào có thật khi dọn hàng giữ cho đơn không được tạo. */
  orderingUrl: string;
  downstreamTimeoutMs: number;
  downstreamResilience: ResilienceConfig;
  /** Job trả hàng đã giữ cho đơn không tồn tại. */
  orphanSweepEnabled: boolean;
  orphanSweepIntervalMs: number;
  /** Chỉ xét lần giữ hàng cũ hơn số phút này (đủ lâu để ordering đã tạo xong đơn nếu có). */
  orphanMinAgeMinutes: number;
  /** Chỉ xét các lần giữ hàng trong số giờ gần nhất. */
  orphanLookbackHours: number;
}

type Env = Record<string, string | undefined>;

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.CATALOG_DATABASE_URL) problems.push('Thiếu CATALOG_DATABASE_URL');
  if (!env.RABBITMQ_URL) problems.push('Thiếu RABBITMQ_URL');
  const secret = env.JWT_ACCESS_SECRET ?? '';
  if (secret.length < 32) problems.push('JWT_ACCESS_SECRET phải có ít nhất 32 ký tự');
  const internalKey = env.INTERNAL_API_KEY ?? '';
  if (internalKey.length < 24) problems.push('INTERNAL_API_KEY phải có ít nhất 24 ký tự');

  const port = Number(env.PORT ?? '3003');
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT phải là số nguyên từ 1 đến 65535');

  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60) problems.push('ACCESS_TOKEN_TTL_SECONDS phải là số nguyên từ 60');

  const int = (key: string, def: number, min: number, max: number): number => {
    const n = Number(env[key] ?? def);
    if (!Number.isInteger(n) || n < min || n > max) { problems.push(`${key} phải là số nguyên từ ${min} đến ${max}`); return def; }
    return n;
  };
  const downstreamTimeoutMs = int('DOWNSTREAM_TIMEOUT_MS', 5000, 100, 60_000);
  const downstreamResilience = readResilienceEnv(env, problems);
  const orphanSweepIntervalMs = int('ORPHAN_SWEEP_INTERVAL_MS', 300_000, 1_000, 86_400_000);
  const orphanMinAgeMinutes = int('ORPHAN_MIN_AGE_MINUTES', 10, 1, 1_440);
  const orphanLookbackHours = int('ORPHAN_LOOKBACK_HOURS', 24, 1, 720);
  const orderingUrl = (env.ORDERING_URL ?? 'http://localhost:3004/api').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s]+$/.test(orderingUrl)) problems.push('ORDERING_URL phải là địa chỉ http(s)');

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);

  return {
    port,
    rabbitUrl: env.RABBITMQ_URL ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    jwt: { secret, issuer: env.JWT_ISSUER ?? 'phucvi', accessTtlSeconds: ttl },
    internalApiKey: internalKey,
    eventQueue: env.CATALOG_EVENT_QUEUE ?? 'catalog.stock',
    relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
    orderingUrl, downstreamTimeoutMs, downstreamResilience,
    orphanSweepEnabled: env.ORPHAN_SWEEP_ENABLED !== 'false', orphanSweepIntervalMs, orphanMinAgeMinutes, orphanLookbackHours,
  };
}
