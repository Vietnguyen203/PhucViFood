import { toDateOnly, toVnDateString } from './vn-date';

export type AffiliateStatusName = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface AffiliateSnapshot {
  id: string;
  status: AffiliateStatusName;
  phone: string; // đã chuẩn hóa +84
  /** Ngày hiệu lực hợp đồng (gồm cả ngày đầu và cuối). null = không giới hạn phía đó. */
  contractStart: Date | string | null;
  contractEnd: Date | string | null;
  commissionRateBps: number;
}

export type AttributionReason =
  | 'OK'
  | 'NO_AFFILIATE' // không có mã hoặc mã không tồn tại
  | 'NOT_ACTIVE' // PENDING, SUSPENDED, REJECTED
  | 'OUT_OF_CONTRACT' // ngoài thời hạn hợp đồng tại NGÀY ĐẶT HÀNG
  | 'SELF_PURCHASE'; // CTV tự mua bằng SĐT của mình

export interface AttributionDecision {
  /** Có gắn đơn với CTV hay không (khớp orders.affiliate_id). */
  affiliateId: string | null;
  /** Cờ orders.is_self_purchase. */
  isSelfPurchase: boolean;
  /** Có tạo hoa hồng hay không. */
  commissionEligible: boolean;
  /** Tỷ lệ chốt tại thời điểm đặt (bps); null khi không tính hoa hồng. */
  rateBps: number | null;
  reason: AttributionReason;
}

const GUEST: Omit<AttributionDecision, 'reason'> = {
  affiliateId: null, isSelfPurchase: false, commissionEligible: false, rateBps: null,
};

/** Kiểm tra hợp đồng theo ngày đặt hàng (giờ Việt Nam). */
export function isContractActiveOn(
  orderedAt: Date,
  contract: Pick<AffiliateSnapshot, 'status' | 'contractStart' | 'contractEnd'>,
): boolean {
  if (contract.status !== 'ACTIVE') return false;
  const day = toVnDateString(orderedAt);
  if (contract.contractStart && day < toDateOnly(contract.contractStart)) return false;
  if (contract.contractEnd && day > toDateOnly(contract.contractEnd)) return false;
  return true;
}

/**
 * Quyết định ghi nhận CTV cho một đơn:
 * - CTV không tồn tại / không ACTIVE / ngoài hợp đồng tại ngày đặt => khách vãng lai.
 * - CTV tự mua (SĐT khách = SĐT CTV) => giữ affiliate_id + cờ is_self_purchase, KHÔNG hoa hồng.
 * - Còn lại => có hoa hồng với tỷ lệ hiện hành của CTV (chốt vào đơn).
 */
export function decideAttribution(args: {
  affiliate: AffiliateSnapshot | null;
  customerPhone: string;
  orderedAt: Date;
}): AttributionDecision {
  const { affiliate, customerPhone, orderedAt } = args;
  if (!affiliate) return { ...GUEST, reason: 'NO_AFFILIATE' };
  if (affiliate.status !== 'ACTIVE') return { ...GUEST, reason: 'NOT_ACTIVE' };
  if (!isContractActiveOn(orderedAt, affiliate)) return { ...GUEST, reason: 'OUT_OF_CONTRACT' };
  if (affiliate.phone === customerPhone) {
    return { affiliateId: affiliate.id, isSelfPurchase: true, commissionEligible: false, rateBps: null, reason: 'SELF_PURCHASE' };
  }
  return { affiliateId: affiliate.id, isSelfPurchase: false, commissionEligible: true, rateBps: affiliate.commissionRateBps, reason: 'OK' };
}
