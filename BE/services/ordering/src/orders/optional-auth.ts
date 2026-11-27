import { verifyAccessToken, type JwtConfig } from '@phucvi/shared-library/auth';

/**
 * Id tài khoản khách (vai trò CUSTOMER) từ header Authorization, nếu có và hợp lệ; ngược lại null.
 * Đặt hàng là API công khai nên token sai, hết hạn hoặc của vai trò khác KHÔNG làm đơn thất bại: đơn vẫn được đặt như khách vãng lai.
 */
export function customerUserIdFrom(authorization: string | undefined, jwt: Pick<JwtConfig, 'publicKey' | 'issuer'>): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
  if (!match) return null;
  try {
    const user = verifyAccessToken(match[1], jwt);
    return user.role === 'CUSTOMER' ? user.id : null;
  } catch {
    return null;
  }
}
