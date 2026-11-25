import jwt from 'jsonwebtoken';
import { AppException } from '../api/errors';
import { UserRole } from '../contracts/enums';
import type { AccessTokenClaims, AuthUser, JwtConfig } from './types';

const ALGORITHM = 'HS256';
export const MIN_JWT_SECRET_LENGTH = 32;

export function assertJwtConfig(config: JwtConfig): void {
  if (!config.secret || config.secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT secret phải có ít nhất ${MIN_JWT_SECRET_LENGTH} ký tự`);
  }
  if (!Number.isInteger(config.accessTtlSeconds) || config.accessTtlSeconds <= 0) {
    throw new Error('accessTtlSeconds phải là số nguyên dương');
  }
}

export function signAccessToken(user: AuthUser, config: JwtConfig): string {
  assertJwtConfig(config);
  const claims: AccessTokenClaims = { sub: user.id, email: user.email, role: user.role };
  return jwt.sign(claims, config.secret, { algorithm: ALGORITHM, issuer: config.issuer, expiresIn: config.accessTtlSeconds });
}

const ROLES = new Set<string>(Object.values(UserRole));

/** Kiểm tra chữ ký, thuật toán, issuer, hạn dùng. Mọi lỗi đều trả UNAUTHORIZED, không nói rõ lý do cho client. */
export function verifyAccessToken(token: string, config: JwtConfig): AuthUser {
  let decoded: unknown;
  try {
    // Chỉ chấp nhận HS256: chặn "alg: none" và tấn công đổi thuật toán.
    decoded = jwt.verify(token, config.secret, { algorithms: [ALGORITHM], issuer: config.issuer, clockTolerance: 5 });
  } catch {
    throw AppException.unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  const c = decoded as Partial<AccessTokenClaims>;
  if (typeof c?.sub !== 'string' || typeof c.email !== 'string' || typeof c.role !== 'string' || !ROLES.has(c.role)) {
    throw AppException.unauthorized('Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
  }
  return { id: c.sub, email: c.email, role: c.role as AuthUser['role'] };
}
