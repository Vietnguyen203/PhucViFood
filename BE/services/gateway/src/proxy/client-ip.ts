import type { IncomingMessage } from 'node:http';

/** `::ffff:1.2.3.4` (IPv4 trong IPv6) về `1.2.3.4` để cùng một người không bị tính thành hai khóa. */
function normalize(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Xác định IP của người dùng.
 * - `hops = 0`: dùng địa chỉ kết nối trực tiếp, KHÔNG tin `X-Forwarded-For` (client tự khai được).
 * - `hops = n`: có n proxy tin cậy đứng trước (vd Caddy = 1); mỗi proxy thêm IP phía trước nó vào cuối `X-Forwarded-For`,
 *   nên IP thật là phần tử thứ n tính từ cuối. Phần tử client tự thêm ở đầu danh sách bị bỏ qua.
 */
export function clientIp(req: Pick<IncomingMessage, 'headers' | 'socket'>, hops: number): string {
  const direct = normalize(req.socket.remoteAddress ?? 'unknown');
  if (hops <= 0) return direct;
  const raw = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(raw) ? raw.join(',') : raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const picked = chain[chain.length - hops];
  return picked ? normalize(picked) : direct;
}
