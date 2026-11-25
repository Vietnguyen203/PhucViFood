import type { UserRole } from '../contracts/enums';

/** Người dùng đã xác thực, gắn vào request.user sau khi kiểm tra access token. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface JwtConfig {
  /** Khóa ký HS256, tối thiểu 32 ký tự. Mọi service kiểm tra token dùng chung khóa này. */
  secret: string;
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
