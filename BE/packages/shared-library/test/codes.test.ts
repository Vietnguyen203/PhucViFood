import { describe, expect, it } from 'vitest';
import {
  ActorType, ActorTypeCodec, AdjustmentStatus, AdjustmentStatusCodec, AffiliateStatus, AffiliateStatusCodec, AttributionSource, AttributionSourceCodec,
  CommissionStatus, CommissionStatusCodec, ContactChannelCodec, ConfirmSourceCodec, OrderStatus, OrderStatusCode,
  OrderStatusCodec, PaymentMethod, PaymentMethodCodec, PaymentStatus, PaymentStatusCodec, ReceivedBy, ReceivedByCodec,
  StockMovementReasonCodec, TrackingEventTypeCodec, UserRole, UserRoleCode, UserRoleCodec, UserStatus, UserStatusCodec, createCodec, type EnumCodec,
} from '../src/contracts';
import { parseListQuery } from '../src/crud';

/**
 * BẢNG KHÓA CỨNG. Số này đã nằm trong dữ liệu và CHECK của migration; nếu test này đỏ nghĩa là có người
 * đổi hoặc tái sử dụng số cũ. Muốn thêm giá trị: thêm dòng mới với số kế tiếp, không sửa dòng cũ.
 */
const FROZEN: Array<[string, EnumCodec<string>, Record<string, number>]> = [
  ['UserRole', UserRoleCodec, { ADMIN: 1, AFFILIATE: 2 }],
  ['UserStatus', UserStatusCodec, { ACTIVE: 1, DISABLED: 2 }],
  ['AffiliateStatus', AffiliateStatusCodec, { PENDING: 1, ACTIVE: 2, SUSPENDED: 3, REJECTED: 4 }],
  ['TrackingEventType', TrackingEventTypeCodec, { PRODUCT_VIEW: 1, ADD_TO_CART: 2, CHECKOUT_START: 3 }],
  ['CommissionStatus', CommissionStatusCodec, { ESTIMATED: 1, CONFIRMED: 2, PAID: 3, CANCELLED: 4 }],
  ['ConfirmSource', ConfirmSourceCodec, { CUSTOMER: 1, ADMIN: 2 }],
  ['AdjustmentStatus', AdjustmentStatusCodec, { PENDING: 1, APPLIED: 2, WAIVED: 3 }],
  ['OrderStatus', OrderStatusCodec, { PLACED: 1, CONFIRMED: 2, SHIPPING: 3, DELIVERED: 4, COMPLETED: 5, CANCELLED: 6, RETURNED: 7 }],
  ['PaymentMethod', PaymentMethodCodec, { COD: 1, BANK_QR: 2 }],
  ['PaymentStatus', PaymentStatusCodec, { PENDING: 1, UNPAID: 2, PAID: 3, REFUNDED: 4 }],
  ['AttributionSource', AttributionSourceCodec, { LINK: 1, CODE: 2 }],
  ['ReceivedBy', ReceivedByCodec, { CUSTOMER: 1, ADMIN: 2 }],
  ['ActorType', ActorTypeCodec, { SYSTEM: 1, CUSTOMER: 2, ADMIN: 3 }],
  ['ContactChannel', ContactChannelCodec, { CALL: 1, ZALO: 2, SMS: 3 }],
  ['StockMovementReason', StockMovementReasonCodec, { ORDER_PLACED: 1, ORDER_CANCELLED: 2, ADMIN_ADJUSTMENT: 3 }],
];

describe('mã số enum (khóa cứng)', () => {
  it.each(FROZEN)('%s giữ nguyên số đã phát hành', (_name, codec, expected) => {
    expect(Object.fromEntries(codec.names.map((n) => [n, codec.toCode(n)]))).toEqual(expected);
  });

  it.each(FROZEN)('%s: số dương, không trùng, tăng dần', (_name, codec) => {
    expect(codec.codes.every((c) => Number.isInteger(c) && c > 0)).toBe(true);
    expect(new Set(codec.codes).size).toBe(codec.codes.length);
    expect([...codec.codes]).toEqual([...codec.codes].sort((a, b) => a - b));
  });

  it('tên trong codec khớp enum chuỗi dùng ở contracts/API/sự kiện', () => {
    const pairs: Array<[Record<string, string>, EnumCodec<string>]> = [
      [UserRole, UserRoleCodec], [OrderStatus, OrderStatusCodec], [PaymentMethod, PaymentMethodCodec],
      [PaymentStatus, PaymentStatusCodec], [AttributionSource, AttributionSourceCodec], [ReceivedBy, ReceivedByCodec],
      [ActorType, ActorTypeCodec], [AffiliateStatus, AffiliateStatusCodec], [CommissionStatus, CommissionStatusCodec],
      [UserStatus, UserStatusCodec], [AdjustmentStatus, AdjustmentStatusCodec],
    ];
    for (const [stringEnum, codec] of pairs) expect([...codec.names].sort()).toEqual(Object.values(stringEnum).sort());
  });
});

describe('codec', () => {
  it('chuyển hai chiều', () => {
    expect(UserRoleCodec.toCode('ADMIN')).toBe(1);
    expect(UserRoleCodec.toName(2)).toBe('AFFILIATE');
    expect(OrderStatusCodec.toName(OrderStatusCode.COMPLETED)).toBe('COMPLETED');
    expect(UserRoleCode.ADMIN).toBe(1); // dùng được như enum số trong code
  });

  it('ném lỗi với tên hoặc mã lạ (dữ liệu hỏng không bị lờ đi)', () => {
    expect(() => UserRoleCodec.toName(99)).toThrow(RangeError);
    expect(() => UserRoleCodec.toName(0)).toThrow(RangeError);
    expect(() => UserRoleCodec.toCode('ROOT' as never)).toThrow(RangeError);
  });

  it('xử lý cột có thể rỗng', () => {
    expect(ReceivedByCodec.toCodeOrNull(null)).toBeNull();
    expect(ReceivedByCodec.toCodeOrNull('ADMIN')).toBe(2);
    expect(ReceivedByCodec.toNameOrNull(undefined)).toBeNull();
    expect(ReceivedByCodec.toNameOrNull(1)).toBe('CUSTOMER');
  });

  it('bỏ qua khóa ngược mà TypeScript tự sinh cho enum số', () => {
    const c = createCodec({ A: 1, B: 2, 1: 'A', 2: 'B' } as Record<string, string | number>);
    expect(c.names).toEqual(['A', 'B']);
  });

  it('has() nhận diện tên hợp lệ', () => {
    expect(OrderStatusCodec.has('SHIPPING')).toBe(true);
    expect(OrderStatusCodec.has('shipping')).toBe(false);
    expect(OrderStatusCodec.has('toString')).toBe(false);
  });
});

describe('CRUD: lọc theo tên enum, truy vấn bằng mã số', () => {
  const config = { sortableFields: ['createdAt'], filterableFields: { status: { codec: OrderStatusCodec } } };

  it('đổi tên sang mã số trong where', () => {
    expect(parseListQuery({ filter: { status: 'COMPLETED' } }, config).where).toEqual({ AND: [{ status: 5 }] });
    expect(parseListQuery({ filter: { status: 'DELIVERED,COMPLETED' } }, config).where).toEqual({ AND: [{ status: { in: [4, 5] } }] });
  });

  it('tên không hợp lệ bị từ chối, nói rõ các giá trị cho phép', () => {
    try {
      parseListQuery({ filter: { status: '5' } }, config); // gửi mã số thay vì tên cũng bị từ chối
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(JSON.stringify((e as { details: unknown }).details)).toContain('PLACED');
    }
    expect(() => parseListQuery({ filter: { status: 'HACKED' } }, config)).toThrow();
  });
});
