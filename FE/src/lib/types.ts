// Kiểu dữ liệu trả về từ API công khai của backend (qua gateway). Tiền là số nguyên VND.

export interface Category { id: string; name: string; slug: string }

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  /** Quy cách bán, vd "hộp 500g". */
  unit: string | null;
  price: number;
  originalPrice: number | null;
  /** Phần trăm giảm so với giá gốc; 0 nếu không giảm. */
  discountPercent: number;
  imageUrl: string | null;
  inStock: boolean;
  category?: Category;
}

export type PaymentMethod = 'COD' | 'BANK_QR';
export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';
export type PaymentStatus = 'PENDING' | 'UNPAID' | 'PAID' | 'REFUNDED';

export interface OrderItem { productId: string; name: string; unitPrice: number; quantity: number; lineTotal: number }

export interface TransferInstructions {
  bankName: string;
  accountNo: string;
  accountHolder: string;
  amount: number;
  /** Nội dung chuyển khoản = mã đơn. */
  content: string;
  /** Quá hạn này chưa thanh toán thì đơn tự bị hủy. */
  dueAt: string | null;
}

/** Đơn hàng như khách thấy (tra cứu bằng mã đơn + SĐT). */
export interface PublicOrder {
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalAmount: number;
  shippingFee: number;
  totalAmount: number;
  shipping: { name: string; phone: string; province: string; ward: string; addressLine: string };
  placedAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items?: OrderItem[];
  history?: Array<{ status: OrderStatus; at: string }>;
  transferInstructions?: TransferInstructions;
  /** Chỉ có ở phản hồi đặt hàng: true nếu là đơn cũ được trả lại do gửi lặp cùng Idempotency-Key. */
  replayed?: boolean;
}

/** Cookie ghi nhận link CTV do API click trả về (kênh có thể null khi link không kèm kênh). */
export interface ReferralCookie { code: string; channelCode: string | null; clickedAt: string; maxAgeDays: number }

/** Dạng cookie API đặt hàng nhận: kênh bỏ trống thì không gửi. */
export interface OrderCookie { code: string; channelCode?: string; clickedAt: string; maxAgeDays: number }
