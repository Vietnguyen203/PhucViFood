import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import { ActorTypeCodec, OrderStatusCodec, PaymentMethodCodec, PaymentStatusCodec } from '@phucvi/shared-library/contracts';
import type { Order } from '../../generated/client';
import { APP_CONFIG, AppConfig, type VnpayConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaymentUrl, isSuccessful, pickVnpParams, responseMessage, verifySignature } from './vnpay';

/** Mã trả về cho VNPay khi gọi IPN (theo tài liệu VNPay). */
export type IpnCode = '00' | '01' | '02' | '04' | '97' | '99';
const IPN_MESSAGE: Record<IpnCode, string> = {
  '00': 'Confirm Success', '01': 'Order not found', '02': 'Order already confirmed', '04': 'Invalid amount', '97': 'Invalid signature', '99': 'Unknown error',
};

export interface CallbackResult {
  /** Mã cho VNPay (IPN). */
  ipn: IpnCode;
  /** Chữ ký hợp lệ và đúng đơn, đúng số tiền. */
  valid: boolean;
  /** Đơn đã được ghi nhận thanh toán (lần này hoặc trước đó). */
  paid: boolean;
  orderCode: string | null;
  message: string;
}

/** Tạo link thanh toán VNPay và ghi nhận kết quả (trang kết quả và IPN) vào đơn. Chỉ tin dữ liệu có chữ ký hợp lệ. */
@Injectable()
export class VnpayService {
  private readonly logger = new Logger('VNPay');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.config.vnpay !== null;
  }

  private get cfg(): VnpayConfig {
    if (!this.config.vnpay) throw AppException.businessRule('Thanh toán VNPay chưa được bật');
    return this.config.vnpay;
  }

  /** Đơn VNPay chưa thanh toán, còn hạn: tạo link sang cổng VNPay. */
  paymentUrl(order: Order, ip: string, now = new Date()): string {
    const c = this.cfg;
    if (PaymentMethodCodec.toName(order.paymentMethod) !== 'VNPAY') throw AppException.businessRule('Đơn này không thanh toán qua VNPay');
    if (PaymentStatusCodec.toName(order.paymentStatus) !== 'UNPAID') throw AppException.businessRule('Đơn này không còn chờ thanh toán');
    const status = OrderStatusCodec.toName(order.status);
    if (status !== 'PLACED' && status !== 'CONFIRMED') throw AppException.businessRule('Đơn đã bị hủy hoặc đã giao, không thể thanh toán');
    if (!order.paymentDueAt || order.paymentDueAt.getTime() <= now.getTime()) throw AppException.businessRule('Đơn đã quá hạn thanh toán');
    return buildPaymentUrl({
      ...c, txnRef: order.code, amountVnd: Number(order.totalAmount), orderInfo: `Thanh toan don hang ${order.code}`,
      ipAddr: /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '127.0.0.1', now, expiresAt: order.paymentDueAt,
    });
  }

  /**
   * Xử lý dữ liệu VNPay gửi về (query của trang kết quả hoặc IPN): kiểm tra chữ ký, đơn, số tiền; thành công thì ghi nhận đã thanh toán.
   * Gọi lặp an toàn: đã thanh toán rồi thì không ghi lại.
   */
  async handle(query: Record<string, unknown>): Promise<CallbackResult> {
    const c = this.cfg;
    const p = pickVnpParams(query);
    const fail = (ipn: IpnCode, message: string, orderCode: string | null = null): CallbackResult => ({ ipn, valid: ipn !== '97', paid: false, orderCode, message });
    if (!verifySignature(p, c.hashSecret)) return fail('97', 'Dữ liệu thanh toán không hợp lệ');

    const code = p.vnp_TxnRef ?? '';
    const order = await this.prisma.order.findUnique({ where: { code } });
    if (!order || PaymentMethodCodec.toName(order.paymentMethod) !== 'VNPAY') return fail('01', 'Không tìm thấy đơn hàng');
    if (p.vnp_Amount !== String(Number(order.totalAmount) * 100)) return fail('04', 'Số tiền thanh toán không khớp', code);

    const alreadyPaid = PaymentStatusCodec.toName(order.paymentStatus) === 'PAID';
    if (!isSuccessful(p)) {
      // Thanh toán thất bại hoặc khách hủy: đơn giữ nguyên chờ thanh toán (khách có thể thử lại đến hết hạn).
      return { ipn: alreadyPaid ? '02' : '00', valid: true, paid: alreadyPaid, orderCode: code, message: alreadyPaid ? 'Đơn đã được thanh toán' : responseMessage(p.vnp_ResponseCode) };
    }
    if (alreadyPaid) return { ipn: '02', valid: true, paid: true, orderCode: code, message: responseMessage('00') };

    const cancelled = ['CANCELLED', 'RETURNED'].includes(OrderStatusCodec.toName(order.status));
    const txn = (p.vnp_TransactionNo ?? '').slice(0, 30);
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, paymentStatus: order.paymentStatus }, data: { paymentStatus: PaymentStatusCodec.toCode('PAID') } });
      if (claimed.count === 0) return false; // vừa được ghi nhận ở nơi khác (IPN và trang kết quả đến cùng lúc)
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id, fromStatus: order.status, toStatus: order.status, actorType: ActorTypeCodec.toCode('SYSTEM'),
          note: `Thanh toán: ${PaymentStatusCodec.toName(order.paymentStatus)} -> PAID (VNPay, mã giao dịch ${txn || 'không rõ'})${cancelled ? '. Đơn đã hủy trước khi nhận tiền: cần hoàn tiền cho khách' : ''}`,
        },
      });
      return true;
    });
    if (cancelled && done) this.logger.warn(`Đơn ${order.code} đã hủy nhưng khách vừa thanh toán VNPay: cần hoàn tiền`);
    return { ipn: done ? '00' : '02', valid: true, paid: true, orderCode: code, message: responseMessage('00') };
  }

  ipnMessage(code: IpnCode): { RspCode: IpnCode; Message: string } {
    return { RspCode: code, Message: IPN_MESSAGE[code] };
  }
}
