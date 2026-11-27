// Mã số của các enum, là NGUỒN SỰ THẬT cho cột SMALLINT trong DB.
//
// Quy ước:
// - DB lưu số nguyên (SMALLINT, có CHECK giới hạn giá trị). Code dùng enum số ở dưới.
// - Bên ngoài DB (API, JWT, sự kiện RabbitMQ) vẫn dùng TÊN chuỗi ("ADMIN", "COMPLETED"):
//   chuyển qua lại bằng codec khi đọc/ghi DB.
// - KHÔNG BAO GIỜ đổi số của giá trị đã có hoặc tái sử dụng số cũ: dữ liệu đã lưu và CHECK
//   trong migration phụ thuộc vào chúng. Thêm giá trị mới thì lấy số kế tiếp.
// - Số 0 không dùng, để phân biệt với "chưa gán".
// - Khi thêm hoặc đổi giá trị: sửa file này, sửa CHECK trong migration mới, cập nhật docs/database.md.

export enum UserRoleCode { ADMIN = 1, AFFILIATE = 2, CUSTOMER = 3 }
export enum UserStatusCode { ACTIVE = 1, DISABLED = 2 }

export enum AffiliateStatusCode { PENDING = 1, ACTIVE = 2, SUSPENDED = 3, REJECTED = 4 }
export enum TrackingEventTypeCode { PRODUCT_VIEW = 1, ADD_TO_CART = 2, CHECKOUT_START = 3 }
export enum CommissionStatusCode { ESTIMATED = 1, CONFIRMED = 2, PAID = 3, CANCELLED = 4 }
/** Ai xác nhận hoa hồng (commission.confirmed_by). */
export enum ConfirmSourceCode { CUSTOMER = 1, ADMIN = 2 }
/** Khoản trừ vào hoa hồng của CTV khi đơn bị hoàn sau lúc đã chi trả (commission.adjustments.status). */
export enum AdjustmentStatusCode { PENDING = 1, APPLIED = 2, WAIVED = 3 }

export enum OrderStatusCode { PLACED = 1, CONFIRMED = 2, SHIPPING = 3, DELIVERED = 4, COMPLETED = 5, CANCELLED = 6, RETURNED = 7 }
export enum PaymentMethodCode { COD = 1, BANK_QR = 2 }
export enum PaymentStatusCode { PENDING = 1, UNPAID = 2, PAID = 3, REFUNDED = 4 }
export enum AttributionSourceCode { LINK = 1, CODE = 2 }
/** Ai xác nhận đã nhận hàng (orders.received_by). */
export enum ReceivedByCode { CUSTOMER = 1, ADMIN = 2 }
export enum ActorTypeCode { SYSTEM = 1, CUSTOMER = 2, ADMIN = 3 }
export enum ContactChannelCode { CALL = 1, ZALO = 2, SMS = 3 }

/** Lý do thay đổi tồn kho (catalog.stock_movements.reason). */
/** Vị trí banner trên trang chủ: MAIN là khung lớn (trượt nhiều ảnh), SIDE là các ô khuyến mãi bên phải. */
/** KOL: người có tầm ảnh hưởng (đông người theo dõi); KOC: khách hàng thật chia sẻ trải nghiệm. */
export enum CreatorKindCode { KOL = 1, KOC = 2 }
export enum BannerSlotCode { MAIN = 1, SIDE = 2 }
export enum StockMovementReasonCode { ORDER_PLACED = 1, ORDER_CANCELLED = 2, ADMIN_ADJUSTMENT = 3 }

/** Chuyển qua lại giữa tên chuỗi (dùng ngoài DB) và mã số (lưu trong DB). */
export interface EnumCodec<Name extends string> {
  /** Tên các giá trị, theo thứ tự mã số tăng dần. */
  readonly names: readonly Name[];
  /** Mã số các giá trị, tăng dần. */
  readonly codes: readonly number[];
  /** Tên sang mã số; ném lỗi nếu tên lạ. */
  toCode(name: Name): number;
  /** Mã số sang tên; ném lỗi nếu mã lạ (dữ liệu hỏng hoặc enum chưa cập nhật). */
  toName(code: number): Name;
  /** Giống toCode nhưng chấp nhận null/undefined (cột có thể rỗng). */
  toCodeOrNull(name: Name | null | undefined): number | null;
  toNameOrNull(code: number | null | undefined): Name | null;
  /** Dùng được làm giá trị cho filter trong CRUD query. */
  has(name: string): name is Name;
}

/** Tạo codec từ một enum số của TypeScript (bỏ qua các khóa ngược mà TypeScript tự sinh). */
export function createCodec<E extends Record<string, string | number>>(enumObject: E): EnumCodec<Extract<keyof E, string>> {
  type Name = Extract<keyof E, string>;
  const entries = (Object.keys(enumObject) as string[])
    .filter((key) => Number.isNaN(Number(key)))
    .map((key) => [key as Name, enumObject[key] as number] as const)
    .sort((a, b) => a[1] - b[1]);
  const byName = new Map<string, number>(entries);
  const byCode = new Map<number, Name>(entries.map(([name, code]) => [code, name]));

  const toCode = (name: Name): number => {
    const code = byName.get(name);
    if (code === undefined) throw new RangeError(`Tên enum không hợp lệ: ${String(name)}`);
    return code;
  };
  const toName = (code: number): Name => {
    const name = byCode.get(code);
    if (name === undefined) throw new RangeError(`Mã enum không hợp lệ: ${code}`);
    return name;
  };
  return {
    names: entries.map(([n]) => n),
    codes: entries.map(([, c]) => c),
    toCode, toName,
    toCodeOrNull: (name) => (name == null ? null : toCode(name)),
    toNameOrNull: (code) => (code == null ? null : toName(code)),
    has: (name): name is Name => byName.has(name),
  };
}

export const UserRoleCodec = createCodec(UserRoleCode);
export const UserStatusCodec = createCodec(UserStatusCode);
export const AffiliateStatusCodec = createCodec(AffiliateStatusCode);
export const TrackingEventTypeCodec = createCodec(TrackingEventTypeCode);
export const CommissionStatusCodec = createCodec(CommissionStatusCode);
export const ConfirmSourceCodec = createCodec(ConfirmSourceCode);
export const AdjustmentStatusCodec = createCodec(AdjustmentStatusCode);
export const OrderStatusCodec = createCodec(OrderStatusCode);
export const PaymentMethodCodec = createCodec(PaymentMethodCode);
export const PaymentStatusCodec = createCodec(PaymentStatusCode);
export const AttributionSourceCodec = createCodec(AttributionSourceCode);
export const ReceivedByCodec = createCodec(ReceivedByCode);
export const ActorTypeCodec = createCodec(ActorTypeCode);
export const ContactChannelCodec = createCodec(ContactChannelCode);
export const StockMovementReasonCodec = createCodec(StockMovementReasonCode);
export const BannerSlotCodec = createCodec(BannerSlotCode);
export const CreatorKindCodec = createCodec(CreatorKindCode);
