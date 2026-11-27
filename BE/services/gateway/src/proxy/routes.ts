/** Bảng định tuyến: tiền tố đường dẫn (sau `/api`) thuộc service nào. Chỉ đường dẫn có trong bảng mới được chuyển tiếp. */

export const SERVICE_NAMES = ['user', 'affiliate', 'tracking', 'catalog', 'ordering', 'customer'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

/** `/internal/*` cố ý KHÔNG có trong bảng: API nội bộ giữa các service không bao giờ ra ngoài. */
export const ROUTE_PREFIXES: Record<ServiceName, readonly string[]> = {
  user: ['/auth', '/users'],
  affiliate: [
    '/me/affiliate', '/me/links', '/me/commissions', '/me/payouts', '/me/adjustments',
    '/affiliates', '/commissions', '/payouts', '/adjustments', '/affiliate-settings',
    '/public/referrals',
  ],
  tracking: ['/public/tracking', '/me/stats'],
  catalog: ['/public/categories', '/public/products', '/public/uploads', '/public/banners', '/categories', '/products', '/banners'],
  ordering: ['/public/orders', '/orders', '/me/orders', '/my-orders', '/order-settings'],
  customer: ['/customers', '/customer-settings'],
};

/**
 * Tuyến khớp cả phương thức lẫn đường dẫn đầy đủ, được ưu tiên hơn tiền tố. Cần vì `/public/referrals` có hai chủ:
 * `POST /public/referrals/click` ghi lượt bấm (tracking), còn `GET /public/referrals/:code` kiểm tra mã (affiliate).
 */
export const EXACT_ROUTES: ReadonlyArray<{ service: ServiceName; method: string; path: string }> = [
  { service: 'tracking', method: 'POST', path: '/public/referrals/click' },
];

// Xếp tiền tố dài trước để khớp cụ thể nhất thắng.
const FLAT = (Object.entries(ROUTE_PREFIXES) as Array<[ServiceName, readonly string[]]>)
  .flatMap(([service, prefixes]) => prefixes.map((prefix) => ({ service, prefix })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

/** Tìm service theo phương thức và đường dẫn (không có query, không có `/api`). Khớp theo từng đoạn: `/orders` khớp `/orders/1` nhưng không khớp `/orders-x`. */
export function resolveService(path: string, method = 'GET'): ServiceName | null {
  const exact = EXACT_ROUTES.find((r) => r.method === method && r.path === path);
  if (exact) return exact.service;
  for (const { service, prefix } of FLAT) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return service;
  }
  return null;
}

/** Chặn các cách viết đường dẫn dùng để lách bảng định tuyến (`..`, `//`, `%2e`, `%2f`, `\`, byte NUL). */
export function isSafePath(path: string): boolean {
  if (/%(2e|2f|5c|00)/i.test(path) || path.includes('\\') || path.includes('//')) return false;
  return !path.split('/').some((segment) => segment === '.' || segment === '..');
}
