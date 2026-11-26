import { readJwtConfig, type JwtConfig } from '@phucvi/shared-library/auth';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  rabbitUrl: string;
  corsOrigins: string[];
  jwt: JwtConfig;
  /** Khóa dùng cho API nội bộ giữa các service (vd ordering hỏi ghi nhận CTV lúc đặt hàng). */
  internalApiKey: string;
  /** Queue nhận sự kiện đơn hàng để tạo/cập nhật hoa hồng. */
  eventQueue: string;
  /** Tắt relay outbox (dùng khi test hoặc chạy relay ở tiến trình riêng). */
  relayEnabled: boolean;
}

type Env = Record<string, string | undefined>;

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.AFFILIATE_DATABASE_URL) problems.push('Thiếu AFFILIATE_DATABASE_URL');
  if (!env.RABBITMQ_URL) problems.push('Thiếu RABBITMQ_URL');
  const internalKey = env.INTERNAL_API_KEY ?? '';
  if (internalKey.length < 24) problems.push('INTERNAL_API_KEY phải có ít nhất 24 ký tự');

  const portRaw = env.PORT ?? '3002';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('PORT phải là số nguyên từ 1 đến 65535');

  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  if (!Number.isInteger(ttl) || ttl < 60) problems.push('ACCESS_TOKEN_TTL_SECONDS phải là số nguyên từ 60');

  // Chỉ kiểm tra token nên chỉ cần khóa công khai (khóa riêng nằm ở user service).
  const jwt = readJwtConfig(env, 'verify', ttl, problems);

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);

  return {
    port,
    rabbitUrl: env.RABBITMQ_URL ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    jwt,
    internalApiKey: internalKey,
    eventQueue: env.AFFILIATE_EVENT_QUEUE ?? 'affiliate.commission',
    relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
  };
}
