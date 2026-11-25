import { uuidv7 } from '../utils/uuid';
import type {
  ActorType, AffiliateStatus, AttributionSource, CommissionStatus, OrderStatus, ReceivedBy, UserRole,
} from './enums';

/** Exchange topic dùng chung. Routing key = tên sự kiện (EventTypes). */
export const EVENT_EXCHANGE = 'phucvi.events';
export const EVENT_DEAD_LETTER_EXCHANGE = 'phucvi.events.dlx';

/** Tên sự kiện: <miền>.<thực thể>.<hành động>. Đổi tên là thay đổi phá vỡ tương thích. */
export const EventTypes = {
  USER_CREATED: 'user.user.created',
  ORDER_PLACED: 'ordering.order.placed',
  ORDER_STATUS_CHANGED: 'ordering.order.status_changed',
  AFFILIATE_STATUS_CHANGED: 'affiliate.affiliate.status_changed',
  COMMISSION_STATUS_CHANGED: 'commission.commission.status_changed',
} as const;

export type ServiceName = 'gateway' | 'user' | 'commerce' | 'affiliate';

// Số tiền trong payload là số nguyên VND (number, an toàn trong JSON); dùng toSafeNumber() khi đổi từ bigint.

export interface UserCreatedPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface OrderPlacedPayload {
  orderId: string;
  code: string;
  customerId: string;
  placedAt: string; // ISO
  subtotalAmount: number; // tổng giá sản phẩm, không gồm ship (cơ sở tính hoa hồng)
  shippingFee: number;
  totalAmount: number;
  /** Kết quả ghi nhận CTV đã chốt vào đơn. null = khách vãng lai. */
  affiliateId: string | null;
  linkId: string | null;
  channelCode: string | null;
  referralCodeUsed: string | null;
  attributionSource: AttributionSource | null;
  isSelfPurchase: boolean;
  /** Tỷ lệ hoa hồng (bps) chốt tại thời điểm đặt, lấy từ kết quả ghi nhận của service affiliate. null = không có hoa hồng. */
  commissionRateBps: number | null;
  items: Array<{ productId: string; quantity: number }>;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  code: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: ActorType;
  actorId: string | null;
  at: string; // ISO
  /** Có khi toStatus = COMPLETED: ai xác nhận đã nhận hàng. */
  receivedBy: ReceivedBy | null;
}

export interface AffiliateStatusChangedPayload {
  affiliateId: string;
  userId: string;
  fromStatus: AffiliateStatus | null;
  toStatus: AffiliateStatus;
}

export interface CommissionStatusChangedPayload {
  commissionId: string;
  orderId: string;
  affiliateId: string;
  amount: number;
  fromStatus: CommissionStatus | null;
  toStatus: CommissionStatus;
}

/** Ánh xạ tên sự kiện sang kiểu payload. Thêm sự kiện mới: khai báo ở EventTypes và ở đây. */
export interface EventPayloads {
  [EventTypes.USER_CREATED]: UserCreatedPayload;
  [EventTypes.ORDER_PLACED]: OrderPlacedPayload;
  [EventTypes.ORDER_STATUS_CHANGED]: OrderStatusChangedPayload;
  [EventTypes.AFFILIATE_STATUS_CHANGED]: AffiliateStatusChangedPayload;
  [EventTypes.COMMISSION_STATUS_CHANGED]: CommissionStatusChangedPayload;
}

export type EventType = keyof EventPayloads;

/** Phong bì sự kiện gửi qua RabbitMQ. `id` cũng là khóa chống xử lý trùng (inbox.message_id). */
export interface EventEnvelope<T extends EventType = EventType> {
  id: string;
  type: T;
  version: number;
  occurredAt: string; // ISO
  source: ServiceName;
  aggregateType: string;
  aggregateId: string;
  correlationId?: string;
  payload: EventPayloads[T];
}

export function createEnvelope<T extends EventType>(args: {
  type: T;
  payload: EventPayloads[T];
  source: ServiceName;
  aggregateType: string;
  aggregateId: string;
  id?: string;
  occurredAt?: Date;
  correlationId?: string;
  version?: number;
}): EventEnvelope<T> {
  return {
    id: args.id ?? uuidv7(),
    type: args.type,
    version: args.version ?? 1,
    occurredAt: (args.occurredAt ?? new Date()).toISOString(),
    source: args.source,
    aggregateType: args.aggregateType,
    aggregateId: args.aggregateId,
    ...(args.correlationId ? { correlationId: args.correlationId } : {}),
    payload: args.payload,
  };
}

const KNOWN_TYPES = new Set<string>(Object.values(EventTypes));

export function isKnownEventType(type: string): type is EventType {
  return KNOWN_TYPES.has(type);
}

/** Kiểm tra hình dạng phong bì nhận từ broker (không kiểm tra sâu payload). */
export function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' && typeof v.type === 'string' && isKnownEventType(v.type) &&
    typeof v.version === 'number' && typeof v.occurredAt === 'string' &&
    typeof v.source === 'string' && typeof v.aggregateType === 'string' &&
    typeof v.aggregateId === 'string' && typeof v.payload === 'object' && v.payload !== null
  );
}
