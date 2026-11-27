import { useEffect, useState } from 'react';
import { api } from './api';
import { createSessionStore } from './admin/auth';
import { PARTNER_KEY } from './account';
import { safeStorage } from './storage';

/**
 * Mã giới thiệu của cộng tác viên đang đăng nhập trên máy này (đã được duyệt), hoặc null nếu là khách vãng lai.
 * Chỉ đọc một lần; lỗi (hết phiên, mất mạng, chưa duyệt) đều coi như chưa có mã: trang vẫn dùng được cho mọi người.
 */
export function useReferralCode(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const session = createSessionStore(safeStorage(), PARTNER_KEY).load();
    if (!session) return;
    const ctl = new AbortController();
    api<{ referralCode: string; status: string }>('/me/affiliate', { token: session.accessToken, signal: ctl.signal })
      .then((r) => setCode(r.data.status === 'ACTIVE' ? r.data.referralCode : null))
      .catch(() => setCode(null));
    return () => ctl.abort();
  }, []);
  return code;
}
