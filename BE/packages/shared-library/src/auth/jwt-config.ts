import { generateKeyPairSync } from 'node:crypto';
import { normalizeKey, publicKeyFromPrivate, assertJwtConfig } from './jwt';
import type { JwtConfig } from './types';

type Env = Record<string, string | undefined>;

/**
 * Đọc cấu hình JWT từ biến môi trường, báo lỗi vào `problems` (cùng kiểu với phần còn lại của loadConfig).
 * - `verify` (mọi service kiểm tra token): cần JWT_PUBLIC_KEY. Khóa riêng nếu có trong môi trường bị bỏ qua, không đưa vào cấu hình.
 * - `sign` (chỉ user service): cần JWT_PRIVATE_KEY; khóa công khai suy ra từ đó (JWT_PUBLIC_KEY nếu có phải khớp).
 */
export function readJwtConfig(env: Env, mode: 'verify' | 'sign', accessTtlSeconds: number, problems: string[]): JwtConfig {
  const issuer = env.JWT_ISSUER ?? 'phucvi';
  const config: JwtConfig = { publicKey: '', issuer, accessTtlSeconds };
  const legacy = env.JWT_ACCESS_SECRET ? ' (JWT_ACCESS_SECRET không còn được dùng)' : '';

  try {
    if (mode === 'sign') {
      if (!env.JWT_PRIVATE_KEY) throw new Error(`Thiếu JWT_PRIVATE_KEY${legacy}; tạo cặp khóa bằng: pnpm jwt:keygen`);
      config.privateKey = normalizeKey(env.JWT_PRIVATE_KEY);
      config.publicKey = publicKeyFromPrivate(config.privateKey);
      if (env.JWT_PUBLIC_KEY) {
        const given = normalizeKey(env.JWT_PUBLIC_KEY);
        if (given.replace(/\s+/g, '') !== config.publicKey.replace(/\s+/g, '')) throw new Error('JWT_PUBLIC_KEY không khớp JWT_PRIVATE_KEY');
      }
      assertJwtConfig(config, { sign: true });
    } else {
      if (!env.JWT_PUBLIC_KEY) throw new Error(`Thiếu JWT_PUBLIC_KEY${legacy}; tạo cặp khóa bằng: pnpm jwt:keygen`);
      config.publicKey = normalizeKey(env.JWT_PUBLIC_KEY);
      assertJwtConfig(config);
    }
  } catch (e) {
    problems.push((e as Error).message);
  }
  return config;
}

/** Sinh cặp khóa RSA 2048 (PEM) để cấp cho môi trường mới hoặc test. */
export function generateJwtKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}
