import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppException } from '../api/errors';
import { UserRole } from '../contracts/enums';
import type { AccessTokenClaims, AuthUser, JwtConfig } from './types';

/**
 * Access token ký RS256 (khóa bất đối xứng): chỉ user service giữ khóa riêng để ký, mọi service khác chỉ có khóa công khai để kiểm tra.
 * Lộ một service kiểm tra token không cho phép kẻ tấn công giả mạo token (khác HS256 dùng chung một bí mật).
 */
const ALGORITHM = 'RS256';
export const MIN_RSA_BITS = 2048;

const publicKeyCache = new Map<string, KeyObject>();

/** Đưa khóa về dạng PEM: nhận PEM nhiều dòng, PEM có `\n` dạng chữ (hay gặp trong .env), hoặc PEM mã hóa base64 một dòng. */
export function normalizeKey(raw: string): string {
  const v = raw.trim().replace(/\\n/g, '\n');
  if (v.includes('-----BEGIN')) return v;
  try { return Buffer.from(v, 'base64').toString('utf8').trim(); } catch { return v; }
}

function parsePublic(pem: string): KeyObject {
  const cached = publicKeyCache.get(pem);
  if (cached) return cached;
  let key: KeyObject;
  try { key = createPublicKey(pem); } catch { throw new Error('Khóa công khai JWT không đọc được (cần PEM của khóa RSA)'); }
  if (key.asymmetricKeyType !== 'rsa') throw new Error('Khóa JWT phải là RSA');
  if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < MIN_RSA_BITS) throw new Error(`Khóa RSA phải từ ${MIN_RSA_BITS} bit`);
  publicKeyCache.set(pem, key);
  return key;
}

/** Khóa công khai suy ra từ khóa riêng (user service chỉ cần cấu hình khóa riêng). */
export function publicKeyFromPrivate(privatePem: string): string {
  let key: KeyObject;
  try { key = createPrivateKey(privatePem); } catch { throw new Error('Khóa riêng JWT không đọc được (cần PEM của khóa RSA, không đặt mật khẩu)'); }
  if (key.asymmetricKeyType !== 'rsa') throw new Error('Khóa JWT phải là RSA');
  return createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
}

/** `sign: true` kiểm tra thêm khóa riêng (service phát hành token) và khóa riêng phải khớp khóa công khai. */
export function assertJwtConfig(config: JwtConfig, options: { sign?: boolean } = {}): void {
  if (!config.publicKey) throw new Error('Thiếu khóa công khai JWT');
  parsePublic(config.publicKey);
  if (!Number.isInteger(config.accessTtlSeconds) || config.accessTtlSeconds <= 0) {
    throw new Error('accessTtlSeconds phải là số nguyên dương');
  }
  if (options.sign) {
    if (!config.privateKey) throw new Error('Thiếu khóa riêng JWT để ký token');
    if (publicKeyFromPrivate(config.privateKey) !== createPublicKey(config.publicKey).export({ type: 'spki', format: 'pem' }).toString()) {
      throw new Error('Khóa riêng và khóa công khai JWT không khớp nhau');
    }
  }
}

export function signAccessToken(user: AuthUser, config: JwtConfig): string {
  assertJwtConfig(config, { sign: true });
  const claims: AccessTokenClaims = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(claims, config.privateKey as string, { algorithm: ALGORITHM, issuer: config.issuer, expiresIn: config.accessTtlSeconds });
}

const ROLES = new Set<string>(Object.values(UserRole));

/** Kiểm tra chữ ký, thuật toán, issuer, hạn dùng. Mọi lỗi đều trả UNAUTHORIZED, không nói rõ lý do cho client. */
export function verifyAccessToken(token: string, config: Pick<JwtConfig, 'publicKey' | 'issuer'>): AuthUser {
  let decoded: unknown;
  try {
    // Chỉ chấp nhận RS256: chặn "alg: none" và tấn công đổi thuật toán (vd HS256 với khóa công khai làm bí mật).
    decoded = jwt.verify(token, parsePublic(config.publicKey), { algorithms: [ALGORITHM], issuer: config.issuer, clockTolerance: 5 });
  } catch {
    throw AppException.unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  const c = decoded as Partial<AccessTokenClaims>;
  if (typeof c?.sub !== 'string' || typeof c.email !== 'string' || typeof c.role !== 'string' || !ROLES.has(c.role)) {
    throw AppException.unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  return { id: c.sub, email: c.email, role: c.role as AuthUser['role'] };
}
