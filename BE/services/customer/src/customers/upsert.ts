import type { Customer, Prisma } from '../../generated/client';
import type { UpsertCustomerDto } from './dto';

type Input = Pick<UpsertCustomerDto, 'fullName' | 'email' | 'province' | 'ward' | 'addressLine' | 'marketingConsent' | 'firstAffiliateId' | 'firstChannelCode'>;

/** Khách mới: lưu nguồn đầu tiên; nếu khách tick đồng ý thì ghi nhận thời điểm đồng ý. */
export function buildCreate(phone: string, input: Input, now: Date): Prisma.CustomerCreateInput {
  const consent = input.marketingConsent === true;
  return {
    phone,
    fullName: input.fullName,
    email: input.email,
    province: input.province,
    ward: input.ward,
    addressLine: input.addressLine,
    firstAffiliateId: input.firstAffiliateId ?? null,
    firstChannelCode: input.firstChannelCode ?? null,
    marketingConsent: consent,
    consentAt: consent ? now : null,
  };
}

/**
 * Khách đã có (cùng SĐT): cập nhật theo đơn mới nhất.
 * - Tên và địa chỉ: lấy theo đơn mới nhất (lịch sử địa chỉ nằm ở snapshot của từng đơn).
 * - Nguồn đầu tiên: KHÔNG bao giờ đổi.
 * - Đồng ý nhận tư vấn: chỉ bật khi khách tick (và chưa đồng ý). Không tick KHÔNG có nghĩa là rút lại;
 *   rút lại là thao tác riêng của admin, để một đơn sau đó không vô tình xóa sự đồng ý đã có.
 */
export function buildUpdate(existing: Pick<Customer, 'marketingConsent'>, input: Input, now: Date): Prisma.CustomerUpdateInput {
  const data: Prisma.CustomerUpdateInput = { fullName: input.fullName };
  if (input.email) data.email = input.email;
  if (input.province) data.province = input.province;
  if (input.ward) data.ward = input.ward;
  if (input.addressLine) data.addressLine = input.addressLine;
  if (input.marketingConsent === true && !existing.marketingConsent) {
    data.marketingConsent = true;
    data.consentAt = now;
    data.consentWithdrawnAt = null;
  }
  return data;
}
