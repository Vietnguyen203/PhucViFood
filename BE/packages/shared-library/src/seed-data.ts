// Dữ liệu mẫu dùng chung cho seed của 3 service, để UUID tham chiếu chéo khớp nhau.
// Chỉ dùng cho dev/demo. Không dùng ở production.

/** UUID cố định dạng v7 cho dữ liệu mẫu: group = loại thực thể, n = số thứ tự. */
export const seedId = (group: number, n: number): string =>
  `01930000-0000-7000-8000-${String(group * 1000 + n).padStart(12, '0')}`;

const G = {
  user: 1, affiliate: 2, link: 3, category: 4, product: 5, customer: 6,
  order: 7, item: 8, payout: 9, visitor: 10, click: 11, event: 12,
} as const;

const vn = (iso: string): Date => new Date(`${iso}+07:00`); // giờ Việt Nam
const hours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3600_000);

// Quy tắc phí ship cho dữ liệu mẫu (cũng nằm trong bảng settings)
export const SHIPPING_FLAT = 30_000;
export const FREE_SHIP_THRESHOLD = 500_000;

// ───────────────────────── user ─────────────────────────

export const USERS = [
  { id: seedId(G.user, 1), email: 'admin@phucvifoods.vn', role: 'ADMIN' as const },
  { id: seedId(G.user, 2), email: 'linh.ctv@example.com', role: 'AFFILIATE' as const },
  { id: seedId(G.user, 3), email: 'hung.ctv@example.com', role: 'AFFILIATE' as const },
];
export const ADMIN_ID = USERS[0].id;

// ───────────────────────── affiliate ─────────────────────────

export const AFFILIATES = [
  {
    id: seedId(G.affiliate, 1), userId: USERS[1].id, fullName: 'Nguyễn Thị Linh',
    phone: '+84901000001', referralCode: 'linh01', status: 'ACTIVE' as const,
    contractStart: '2026-01-01', contractEnd: '2026-12-31', commissionRateBps: 1000,
    bankName: 'Vietcombank', bankAccountNo: '0011000000001', bankAccountHolder: 'NGUYEN THI LINH',
  },
  {
    // Hợp đồng đã hết hạn 31/10/2026: đơn đặt sau ngày này tính khách vãng lai.
    id: seedId(G.affiliate, 2), userId: USERS[2].id, fullName: 'Trần Văn Hùng',
    phone: '+84901000002', referralCode: 'hung02', status: 'ACTIVE' as const,
    contractStart: '2026-01-01', contractEnd: '2026-10-31', commissionRateBps: 1000,
    bankName: 'Techcombank', bankAccountNo: '1903000000002', bankAccountHolder: 'TRAN VAN HUNG',
  },
];
export const [AFF_A, AFF_B] = AFFILIATES;

export const LINKS = [
  { id: seedId(G.link, 1), affiliateId: AFF_A.id, channelCode: 'facebook', label: 'Facebook cá nhân' },
  { id: seedId(G.link, 2), affiliateId: AFF_A.id, channelCode: 'tiktok', label: 'TikTok shop' },
  { id: seedId(G.link, 3), affiliateId: AFF_A.id, channelCode: 'zalo', label: 'Nhóm Zalo' },
  { id: seedId(G.link, 4), affiliateId: AFF_B.id, channelCode: 'facebook', label: 'Fanpage' },
];
const link = (affiliateId: string, channel: string) =>
  LINKS.find((l) => l.affiliateId === affiliateId && l.channelCode === channel)!;

// ───────────────────────── catalog ─────────────────────────

export const CATEGORIES = [
  { id: seedId(G.category, 1), name: 'Hải sản khô', slug: 'hai-san-kho', sortOrder: 1 },
  { id: seedId(G.category, 2), name: 'Đặc sản vùng miền', slug: 'dac-san-vung-mien', sortOrder: 2 },
  { id: seedId(G.category, 3), name: 'Trà và cà phê', slug: 'tra-ca-phe', sortOrder: 3 },
  { id: seedId(G.category, 4), name: 'Gia vị và nước chấm', slug: 'gia-vi-nuoc-cham', sortOrder: 4 },
];

export const PRODUCTS = [
  { id: seedId(G.product, 1), categoryId: CATEGORIES[0].id, name: 'Khô cá lóc 500g', slug: 'kho-ca-loc-500g', sku: 'KCL-500', unit: 'gói 500g', price: 220_000, originalPrice: 250_000, stock: 80 },
  { id: seedId(G.product, 2), categoryId: CATEGORIES[0].id, name: 'Mực khô loại 1 300g', slug: 'muc-kho-loai-1-300g', sku: 'MK1-300', unit: 'gói 300g', price: 390_000, originalPrice: null, stock: 50 },
  { id: seedId(G.product, 3), categoryId: CATEGORIES[0].id, name: 'Tôm khô Cà Mau 200g', slug: 'tom-kho-ca-mau-200g', sku: 'TKC-200', unit: 'gói 200g', price: 180_000, originalPrice: 200_000, stock: 120 },
  { id: seedId(G.product, 4), categoryId: CATEGORIES[1].id, name: 'Nem chua Thanh Hóa (10 cái)', slug: 'nem-chua-thanh-hoa-10', sku: 'NCT-10', unit: 'hộp 10 cái', price: 85_000, originalPrice: null, stock: 200 },
  { id: seedId(G.product, 5), categoryId: CATEGORIES[2].id, name: 'Chè Thái Nguyên 200g', slug: 'che-thai-nguyen-200g', sku: 'CTN-200', unit: 'hộp 200g', price: 120_000, originalPrice: 140_000, stock: 150 },
  { id: seedId(G.product, 6), categoryId: CATEGORIES[2].id, name: 'Cà phê Buôn Ma Thuột 500g', slug: 'ca-phe-bmt-500g', sku: 'CPB-500', unit: 'gói 500g', price: 165_000, originalPrice: null, stock: 100 },
  { id: seedId(G.product, 7), categoryId: CATEGORIES[3].id, name: 'Nước mắm Phú Quốc 500ml', slug: 'nuoc-mam-phu-quoc-500ml', sku: 'NMP-500', unit: 'chai 500ml', price: 95_000, originalPrice: null, stock: 90 },
  { id: seedId(G.product, 8), categoryId: CATEGORIES[3].id, name: 'Muối tôm Tây Ninh 250g', slug: 'muoi-tom-tay-ninh-250g', sku: 'MTT-250', unit: 'hũ 250g', price: 45_000, originalPrice: null, stock: 300 },
];
const product = (n: number) => PRODUCTS[n - 1];

// ───────────────────────── customer ─────────────────────────

export const CUSTOMERS = [
  { id: seedId(G.customer, 1), phone: '+84912000001', fullName: 'Phạm Minh Anh', email: 'minhanh@example.com', province: 'Thành phố Hà Nội', ward: 'Phường Cầu Giấy', addressLine: '12 Trần Thái Tông', firstAffiliateId: AFF_A.id, firstChannelCode: 'facebook', consent: true, consentAt: vn('2026-09-20T10:00:00') },
  { id: seedId(G.customer, 2), phone: '+84912000002', fullName: 'Lê Quốc Bảo', email: null, province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Nghé', addressLine: '45 Lê Thánh Tôn', firstAffiliateId: AFF_B.id, firstChannelCode: 'facebook', consent: true, consentAt: vn('2026-10-12T09:00:00') },
  { id: seedId(G.customer, 3), phone: '+84912000003', fullName: 'Võ Thu Hà', email: null, province: 'Thành phố Đà Nẵng', ward: 'Phường Hải Châu', addressLine: '8 Bạch Đằng', firstAffiliateId: null, firstChannelCode: null, consent: false, consentAt: null },
  { id: seedId(G.customer, 4), phone: '+84912000004', fullName: 'Đặng Hoàng Nam', email: null, province: 'Thành phố Cần Thơ', ward: 'Phường Ninh Kiều', addressLine: '20 Hòa Bình', firstAffiliateId: null, firstChannelCode: null, consent: true, consentAt: vn('2026-05-15T20:00:00') },
  // Trùng SĐT của CTV Linh: dùng để thử luật "CTV tự mua không tính hoa hồng".
  { id: seedId(G.customer, 5), phone: AFF_A.phone, fullName: AFF_A.fullName, email: null, province: 'Thành phố Hà Nội', ward: 'Phường Dịch Vọng', addressLine: '5 Duy Tân', firstAffiliateId: null, firstChannelCode: null, consent: false, consentAt: null },
];
const customer = (n: number) => CUSTOMERS[n - 1];

// ───────────────────────── ordering ─────────────────────────

type OrderStatusName = 'PLACED' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';

interface OrderDef {
  n: number;
  code: string;
  customerN: number;
  status: OrderStatusName;
  paymentMethod: 'COD' | 'BANK_QR';
  paymentStatus: 'PENDING' | 'UNPAID' | 'PAID' | 'REFUNDED';
  placedAt: string;
  deliveredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  returnedAt?: string;
  receivedBy?: 'CUSTOMER' | 'ADMIN';
  attribution?: { affiliateId: string; channel: string; source: 'LINK' | 'CODE' };
  referralCodeUsed?: string;
  isSelfPurchase?: boolean;
  items: Array<[productN: number, qty: number]>;
}

const ORDER_DEFS: OrderDef[] = [
  // 1. Khách vãng lai, vừa đặt
  { n: 1, code: 'PV-261124-K3M7', customerN: 3, status: 'PLACED', paymentMethod: 'COD', paymentStatus: 'PENDING', placedAt: '2026-11-24T08:30:00', items: [[5, 1], [6, 1]] },
  // 2. Khách nhập mã hung02 nhưng hợp đồng đã hết hạn (31/10) => vãng lai, không hoa hồng
  { n: 2, code: 'PV-261122-R8T2', customerN: 2, status: 'CONFIRMED', paymentMethod: 'BANK_QR', paymentStatus: 'UNPAID', placedAt: '2026-11-22T14:10:00', referralCodeUsed: 'hung02', items: [[7, 2], [8, 2]] },
  // 3. Link tiktok của Linh, đang giao
  { n: 3, code: 'PV-261120-W5N9', customerN: 1, status: 'SHIPPING', paymentMethod: 'COD', paymentStatus: 'PENDING', placedAt: '2026-11-20T09:00:00', attribution: { affiliateId: AFF_A.id, channel: 'tiktok', source: 'LINK' }, items: [[2, 1], [3, 1]] },
  // 4. Khách nhập mã linh01 ở thanh toán, đã giao 11 ngày chưa chốt => nằm hàng chờ CSKH
  { n: 4, code: 'PV-261110-D4F6', customerN: 1, status: 'DELIVERED', paymentMethod: 'COD', paymentStatus: 'PAID', placedAt: '2026-11-10T19:20:00', deliveredAt: '2026-11-13T10:00:00', attribution: { affiliateId: AFF_A.id, channel: 'facebook', source: 'CODE' }, referralCodeUsed: 'linh01', items: [[1, 2], [4, 2]] },
  // 5. CTV Hùng (còn hạn lúc đặt), đã giao 27 ngày chưa chốt => đầu hàng chờ CSKH
  { n: 5, code: 'PV-261025-H2Z8', customerN: 2, status: 'DELIVERED', paymentMethod: 'BANK_QR', paymentStatus: 'PAID', placedAt: '2026-10-25T21:00:00', deliveredAt: '2026-10-28T15:00:00', attribution: { affiliateId: AFF_B.id, channel: 'facebook', source: 'LINK' }, items: [[5, 2]] },
  // 6. Hoàn tất, khách xác nhận; hoa hồng đã chi trả
  { n: 6, code: 'PV-261015-J7Q1', customerN: 1, status: 'COMPLETED', paymentMethod: 'COD', paymentStatus: 'PAID', placedAt: '2026-10-15T11:00:00', deliveredAt: '2026-10-18T09:30:00', completedAt: '2026-10-19T08:00:00', receivedBy: 'CUSTOMER', attribution: { affiliateId: AFF_A.id, channel: 'facebook', source: 'LINK' }, items: [[1, 1], [2, 1]] },
  // 7. Hoàn tất do admin chuyển sau khi CSKH xử lý; hoa hồng đã chi trả
  { n: 7, code: 'PV-260920-M6B4', customerN: 1, status: 'COMPLETED', paymentMethod: 'BANK_QR', paymentStatus: 'PAID', placedAt: '2026-09-20T16:40:00', deliveredAt: '2026-09-24T14:00:00', completedAt: '2026-09-27T10:00:00', receivedBy: 'ADMIN', attribution: { affiliateId: AFF_A.id, channel: 'zalo', source: 'LINK' }, items: [[3, 3], [6, 2]] },
  // 8. Hoàn tất, hoa hồng CONFIRMED chờ chi trả
  { n: 8, code: 'PV-261101-X9L5', customerN: 1, status: 'COMPLETED', paymentMethod: 'BANK_QR', paymentStatus: 'PAID', placedAt: '2026-11-01T10:15:00', deliveredAt: '2026-11-04T11:00:00', completedAt: '2026-11-05T09:00:00', receivedBy: 'CUSTOMER', attribution: { affiliateId: AFF_A.id, channel: 'facebook', source: 'LINK' }, items: [[6, 2]] },
  // 9. Khách hủy đơn => hoa hồng CANCELLED
  { n: 9, code: 'PV-261108-P1Y3', customerN: 2, status: 'CANCELLED', paymentMethod: 'COD', paymentStatus: 'PENDING', placedAt: '2026-11-08T13:00:00', cancelledAt: '2026-11-08T16:00:00', attribution: { affiliateId: AFF_A.id, channel: 'facebook', source: 'LINK' }, items: [[7, 1]] },
  // 10. Hoàn hàng => hoa hồng CANCELLED
  { n: 10, code: 'PV-261012-S3V8', customerN: 2, status: 'RETURNED', paymentMethod: 'COD', paymentStatus: 'REFUNDED', placedAt: '2026-10-12T08:45:00', deliveredAt: '2026-10-15T10:00:00', returnedAt: '2026-10-18T09:00:00', attribution: { affiliateId: AFF_B.id, channel: 'facebook', source: 'LINK' }, items: [[2, 1]] },
  // 11. Khách vãng lai cũ (đã rời)
  { n: 11, code: 'PV-260515-B2C7', customerN: 4, status: 'COMPLETED', paymentMethod: 'COD', paymentStatus: 'PAID', placedAt: '2026-05-15T19:00:00', deliveredAt: '2026-05-18T10:00:00', completedAt: '2026-05-19T10:00:00', receivedBy: 'CUSTOMER', items: [[4, 3], [8, 2]] },
  // 12. CTV Linh tự mua bằng SĐT của mình: giữ affiliate_id + cờ, không tạo hoa hồng
  { n: 12, code: 'PV-261118-G5H1', customerN: 5, status: 'CONFIRMED', paymentMethod: 'COD', paymentStatus: 'PENDING', placedAt: '2026-11-18T12:00:00', attribution: { affiliateId: AFF_A.id, channel: 'facebook', source: 'LINK' }, isSelfPurchase: true, items: [[8, 4]] },
];

export interface OrderSeed {
  id: string; code: string; customerId: string;
  status: OrderStatusName; paymentMethod: OrderDef['paymentMethod']; paymentStatus: OrderDef['paymentStatus'];
  subtotal: number; shippingFee: number; total: number;
  affiliateId: string | null; linkId: string | null; channelCode: string | null;
  referralCodeUsed: string | null; attributionSource: 'LINK' | 'CODE' | null; isSelfPurchase: boolean;
  shipName: string; shipPhone: string; shipProvince: string; shipWard: string; shipAddressLine: string;
  placedAt: Date; deliveredAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; returnedAt: Date | null;
  receivedBy: 'CUSTOMER' | 'ADMIN' | null; cancelReason: string | null;
  items: Array<{ id: string; productId: string; productName: string; unitPrice: number; quantity: number; lineTotal: number }>;
  history: Array<{ fromStatus: OrderStatusName | null; toStatus: OrderStatusName; actorType: 'SYSTEM' | 'CUSTOMER' | 'ADMIN'; actorId: string | null; at: Date; note: string | null }>;
}

function buildHistory(o: OrderDef): OrderSeed['history'] {
  const placed = vn(o.placedAt);
  const steps: Array<[OrderStatusName, Date, OrderSeed['history'][number]['actorType'], string | null]> = [
    ['PLACED', placed, 'CUSTOMER', null],
  ];
  const rank: OrderStatusName[] = ['PLACED', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'COMPLETED'];
  if (o.status === 'CANCELLED') {
    steps.push(['CANCELLED', vn(o.cancelledAt!), 'CUSTOMER', 'Khách đổi ý']);
  } else {
    const upTo = o.status === 'RETURNED' ? 3 : rank.indexOf(o.status);
    if (upTo >= 1) steps.push(['CONFIRMED', hours(placed, 2), 'ADMIN', null]);
    if (upTo >= 2) steps.push(['SHIPPING', hours(placed, 24), 'ADMIN', null]);
    if (upTo >= 3) steps.push(['DELIVERED', vn(o.deliveredAt!), 'ADMIN', null]);
    if (upTo >= 4) steps.push(['COMPLETED', vn(o.completedAt!), o.receivedBy === 'ADMIN' ? 'ADMIN' : 'CUSTOMER', o.receivedBy === 'ADMIN' ? 'Admin chuyển sau khi CSKH xử lý' : null]);
    if (o.status === 'RETURNED') steps.push(['RETURNED', vn(o.returnedAt!), 'ADMIN', 'Khách trả hàng']);
  }
  return steps.map(([toStatus, at, actorType, note], i) => ({
    fromStatus: i === 0 ? null : steps[i - 1][0],
    toStatus, actorType, actorId: actorType === 'ADMIN' ? ADMIN_ID : null, at, note,
  }));
}

export const ORDERS: OrderSeed[] = ORDER_DEFS.map((o) => {
  const c = customer(o.customerN);
  const items = o.items.map(([pn, qty], i) => {
    const p = product(pn);
    return { id: seedId(G.item, o.n * 10 + i + 1), productId: p.id, productName: p.name, unitPrice: p.price, quantity: qty, lineTotal: p.price * qty };
  });
  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
  const shippingFee = subtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FLAT;
  return {
    id: seedId(G.order, o.n), code: o.code, customerId: c.id,
    status: o.status, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
    subtotal, shippingFee, total: subtotal + shippingFee,
    affiliateId: o.attribution?.affiliateId ?? null,
    linkId: o.attribution ? link(o.attribution.affiliateId, o.attribution.channel).id : null,
    channelCode: o.attribution?.channel ?? null,
    referralCodeUsed: o.referralCodeUsed ?? (o.attribution?.source === 'LINK' ? AFFILIATES.find((a) => a.id === o.attribution!.affiliateId)!.referralCode : null),
    attributionSource: o.attribution?.source ?? null,
    isSelfPurchase: o.isSelfPurchase ?? false,
    shipName: c.fullName, shipPhone: c.phone, shipProvince: c.province, shipWard: c.ward, shipAddressLine: c.addressLine,
    placedAt: vn(o.placedAt),
    deliveredAt: o.deliveredAt ? vn(o.deliveredAt) : null,
    completedAt: o.completedAt ? vn(o.completedAt) : null,
    cancelledAt: o.cancelledAt ? vn(o.cancelledAt) : null,
    returnedAt: o.returnedAt ? vn(o.returnedAt) : null,
    receivedBy: o.receivedBy ?? null,
    cancelReason: o.status === 'CANCELLED' ? 'Khách đổi ý' : o.status === 'RETURNED' ? 'Khách trả hàng' : null,
    items, history: buildHistory(o),
  };
});

export const CARE_NOTES = [
  { orderN: 4, note: 'Gọi lần 1 chưa nghe máy, hẹn gọi lại chiều.', channel: 'CALL' as const, at: vn('2026-11-16T10:00:00') },
  { orderN: 4, note: 'Nhắn Zalo hỏi đã nhận hàng chưa, khách chưa trả lời.', channel: 'ZALO' as const, at: vn('2026-11-19T15:30:00') },
  { orderN: 5, note: 'Khách báo đã nhận, đang kiểm tra hàng, sẽ xác nhận sau.', channel: 'CALL' as const, at: vn('2026-11-02T09:00:00') },
].map((c, i) => ({ id: seedId(13, i + 1), orderId: seedId(G.order, c.orderN), ...c }));

// ───────────────────────── commission ─────────────────────────

export const PAYOUTS = [
  {
    id: seedId(G.payout, 1), affiliateId: AFF_A.id, totalAmount: 148_000,
    paidAt: vn('2026-11-01T10:00:00'), paymentReference: 'VCB-20261101-0001', note: 'Chi trả hoa hồng tháng 10/2026',
  },
];

type CommissionPlan = {
  status: 'ESTIMATED' | 'CONFIRMED' | 'PAID' | 'CANCELLED';
  confirmedBy?: 'CUSTOMER' | 'ADMIN'; payoutN?: number;
};
const COMMISSION_PLAN: Record<number, CommissionPlan> = {
  3: { status: 'ESTIMATED' }, 4: { status: 'ESTIMATED' }, 5: { status: 'ESTIMATED' },
  6: { status: 'PAID', confirmedBy: 'CUSTOMER', payoutN: 1 },
  7: { status: 'PAID', confirmedBy: 'ADMIN', payoutN: 1 },
  8: { status: 'CONFIRMED', confirmedBy: 'CUSTOMER' },
  9: { status: 'CANCELLED' }, 10: { status: 'CANCELLED' },
  // Đơn 12 (CTV tự mua) và đơn khách vãng lai (1, 2, 11): không có hoa hồng.
};

export const COMMISSIONS = ORDERS.flatMap((o, idx) => {
  const plan = COMMISSION_PLAN[idx + 1];
  if (!plan || !o.affiliateId) return [];
  const aff = AFFILIATES.find((a) => a.id === o.affiliateId)!;
  const amount = Math.floor((o.subtotal * aff.commissionRateBps) / 10_000);
  const payout = plan.payoutN ? PAYOUTS[plan.payoutN - 1] : undefined;
  return [{
    id: seedId(14, idx + 1), orderId: o.id, orderCode: o.code, affiliateId: o.affiliateId, linkId: o.linkId,
    channelCode: o.channelCode, rateBps: aff.commissionRateBps, baseAmount: o.subtotal, amount,
    status: plan.status,
    confirmedAt: plan.confirmedBy ? (o.completedAt as Date) : null,
    confirmedBy: plan.confirmedBy ?? null,
    paidAt: payout?.paidAt ?? null, payoutId: payout?.id ?? null,
    cancelledAt: plan.status === 'CANCELLED' ? ((o.cancelledAt ?? o.returnedAt) as Date) : null,
    cancelReason: plan.status === 'CANCELLED' ? (o.status === 'CANCELLED' ? 'Đơn bị hủy' : 'Đơn bị hoàn') : null,
  }];
});

// ───────────────────────── tracking ─────────────────────────

const visitor = (n: number) => seedId(G.visitor, n);
const clickRows: Array<[affiliate: typeof AFF_A, channel: string, visitorN: number, at: string, landing: string]> = [
  [AFF_A, 'facebook', 1, '2026-11-09T20:00:00', '/r/linh01?c=facebook'],
  [AFF_A, 'facebook', 2, '2026-11-09T21:10:00', '/r/linh01?c=facebook'],
  [AFF_A, 'tiktok', 3, '2026-11-19T18:00:00', '/r/linh01?c=tiktok'],
  [AFF_A, 'tiktok', 1, '2026-11-20T08:50:00', '/r/linh01?c=tiktok'],
  [AFF_A, 'zalo', 4, '2026-11-15T07:30:00', '/r/linh01?c=zalo'],
  [AFF_B, 'facebook', 5, '2026-10-24T20:30:00', '/r/hung02?c=facebook'],
  [AFF_B, 'facebook', 6, '2026-10-30T22:00:00', '/r/hung02?c=facebook'],
  [AFF_A, 'facebook', 7, '2026-11-17T11:00:00', '/r/linh01?c=facebook'],
];
export const CLICKS = clickRows.map(([aff, channel, vn_, at, landing], i) => ({
  id: seedId(G.click, i + 1), affiliateId: aff.id,
  linkId: link(aff.id, channel).id, channelCode: channel, visitorId: visitor(vn_),
  landingPath: landing, userAgent: 'Mozilla/5.0 (seed)', createdAt: vn(at),
}));

const eventRows: Array<[typeof AFF_A, string, number, 'PRODUCT_VIEW' | 'ADD_TO_CART' | 'CHECKOUT_START', number | null, string]> = [
  [AFF_A, 'facebook', 1, 'PRODUCT_VIEW', 1, '2026-11-09T20:02:00'],
  [AFF_A, 'facebook', 1, 'ADD_TO_CART', 1, '2026-11-09T20:05:00'],
  [AFF_A, 'facebook', 1, 'CHECKOUT_START', null, '2026-11-09T20:08:00'],
  [AFF_A, 'facebook', 2, 'PRODUCT_VIEW', 4, '2026-11-09T21:12:00'],
  [AFF_A, 'tiktok', 3, 'PRODUCT_VIEW', 2, '2026-11-19T18:02:00'],
  [AFF_A, 'tiktok', 3, 'ADD_TO_CART', 2, '2026-11-19T18:04:00'],
  [AFF_B, 'facebook', 5, 'PRODUCT_VIEW', 5, '2026-10-24T20:33:00'],
  [AFF_B, 'facebook', 5, 'ADD_TO_CART', 5, '2026-10-24T20:36:00'],
];
export const TRACKING_EVENTS = eventRows.map(([aff, channel, vn_, type, productN, at], i) => ({
  id: seedId(G.event, i + 1), affiliateId: aff.id, visitorId: visitor(vn_), channelCode: channel,
  type, productId: productN ? product(productN).id : null, createdAt: vn(at),
}));

// ───────────────────────── settings ─────────────────────────

export const CUSTOMER_SETTINGS = [
  { key: 'segment.returning_min_orders', value: 2, description: 'Từ số đơn hợp lệ này trở lên là khách quen' },
  { key: 'segment.vip_min_orders', value: 5, description: 'Từ số đơn hợp lệ này là VIP' },
  { key: 'segment.vip_min_spend', value: 5_000_000, description: 'Hoặc tổng chi tiêu (VND) từ mức này là VIP' },
  { key: 'activity.active_days', value: 60, description: 'Đơn gần nhất trong N ngày: hoạt động' },
  { key: 'activity.at_risk_days', value: 120, description: 'Đơn gần nhất trong N ngày: sắp rời; vượt mức này là đã rời' },
];
export const ORDERING_SETTINGS = [
  { key: 'shipping.flat_fee', value: SHIPPING_FLAT, description: 'Phí ship đồng giá (VND)' },
  { key: 'shipping.free_threshold', value: FREE_SHIP_THRESHOLD, description: 'Miễn phí ship khi tổng giá sản phẩm từ mức này (VND)' },
  // Thông tin nhận chuyển khoản QR (giá trị mẫu cho demo, thay bằng tài khoản thật của công ty).
  { key: 'payment.bank_name', value: 'Vietcombank', description: 'Ngân hàng nhận tiền chuyển khoản' },
  { key: 'payment.bank_account_no', value: '0011000000000', description: 'Số tài khoản nhận tiền' },
  { key: 'payment.bank_account_holder', value: 'CONG TY PHUC VI FOODS', description: 'Tên chủ tài khoản' },
];
export const AFFILIATE_SETTINGS = [
  { key: 'cookie_days', value: 30, description: 'Số ngày cookie ghi nhận link CTV' },
  { key: 'default_rate_bps', value: 1000, description: 'Tỷ lệ hoa hồng mặc định (1000 = 10%)' },
];
