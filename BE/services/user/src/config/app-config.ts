import { readJwtConfig, type JwtConfig } from '@phucvi/shared-library/auth';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  port: number;
  rabbitUrl: string;
  corsOrigins: string[];
  jwt: JwtConfig;
  refreshTtlDays: number;
  bcryptRounds: number;
  /** Số lần nhập sai mật khẩu liên tiếp trước khi khóa tạm. */
  maxFailedLogins: number;
  lockMinutes: number;
  /** Tắt relay outbox (dùng khi test hoặc chạy relay ở tiến trình riêng). */
  relayEnabled: boolean;
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, fallback: number, problems: string[], min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems.push(`${key} phải là số nguyên từ ${min} đến ${max}`);
    return fallback;
  }
  return n;
}

/** Đọc và kiểm tra biến môi trường. Thiếu hoặc sai thì báo TẤT CẢ lỗi một lượt và dừng khởi động. */
export function loadConfig(env: Env = process.env): AppConfig {
  const problems: string[] = [];

  if (!env.USER_DATABASE_URL) problems.push('Thiếu USER_DATABASE_URL');
  if (!env.RABBITMQ_URL) problems.push('Thiếu RABBITMQ_URL');

  const config: AppConfig = {
    port: int(env, 'PORT', 3001, problems, 1, 65535),
    rabbitUrl: env.RABBITMQ_URL ?? '',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    // User service là nơi duy nhất ký token: cần khóa riêng (khóa công khai suy ra từ đó).
    jwt: readJwtConfig(env, 'sign', int(env, 'ACCESS_TOKEN_TTL_SECONDS', 900, problems, 60, 86_400), problems),
    refreshTtlDays: int(env, 'REFRESH_TOKEN_TTL_DAYS', 30, problems, 1, 365),
    bcryptRounds: int(env, 'BCRYPT_ROUNDS', 12, problems, 4, 15),
    maxFailedLogins: int(env, 'MAX_FAILED_LOGINS', 5, problems, 1, 100),
    lockMinutes: int(env, 'LOGIN_LOCK_MINUTES', 15, problems, 1, 1440),
    relayEnabled: env.OUTBOX_RELAY_ENABLED !== 'false',
  };

  if (problems.length) throw new Error(`Cấu hình không hợp lệ:\n - ${problems.join('\n - ')}`);
  return config;
}
