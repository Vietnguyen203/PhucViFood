import type { UserRole } from '../contracts/enums';

/** Người dùng đã xác thực, gắn vào request.user sau khi kiểm tra access token. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface JwtConfig {
  /** Khóa công khai RSA (PEM) để kiểm tra chữ ký RS256. Mọi service đều có. */
  publicKey: string;
  /** Khóa riêng RSA (PEM) để ký. CHỈ user service có; service khác không bao giờ nhận khóa này. */
  privateKey?: string;
  issuer: string;
  accessTtlSeconds: number;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  iss?: string;
  iat?: number;
  exp?: number;
}
