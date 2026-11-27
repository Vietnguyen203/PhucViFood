import { Controller, Get, Inject, Logger, Query, Res } from '@nestjs/common';
import { ParamTypes } from '@phucvi/shared-library/api';
import { Public } from '@phucvi/shared-library/auth';
import type { Response } from 'express';
import { VnpayService } from './vnpay.service';

/** Giao diện hỏi cửa hàng đang bật những cách thanh toán online nào. */
@Public()
@Controller('public/payments')
export class PaymentOptionsController {
  constructor(@Inject(VnpayService) private readonly vnpay: VnpayService) {}

  @Get('options')
  options() {
    return { vnpay: this.vnpay.enabled };
  }
}

/** VNPay gọi về (không cần đăng nhập, bảo vệ bằng chữ ký HMAC của VNPay). */
@Public()
@Controller('public/payments/vnpay')
export class VnpayController {
  private readonly logger = new Logger('VNPay');

  constructor(@Inject(VnpayService) private readonly vnpay: VnpayService) {}

  /** Trang kết quả của cửa hàng chuyển nguyên query của VNPay vào đây để xác thực và ghi nhận thanh toán. */
  @Get('return') @ParamTypes(Object)
  async result(@Query() query: Record<string, unknown>) {
    const r = await this.vnpay.handle(query);
    if (!r.valid) this.logger.warn('Trang kết quả nhận dữ liệu VNPay sai chữ ký');
    return { success: r.paid, valid: r.valid, orderCode: r.orderCode, message: r.message };
  }

  /**
   * IPN: VNPay gọi máy chủ ngay khi có kết quả. VNPay chỉ đọc `RspCode` ở gốc JSON nên trả thẳng, không bọc `{ success, data }` như API khác
   * (dùng `@Res()` để Nest không gói kết quả).
   */
  @Get('ipn') @ParamTypes(Object, Object)
  async ipn(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    let body: { RspCode: string; Message: string };
    try {
      body = this.vnpay.ipnMessage((await this.vnpay.handle(query)).ipn);
    } catch (e) {
      this.logger.error(`IPN lỗi: ${e instanceof Error ? e.message : e}`);
      body = this.vnpay.ipnMessage('99');
    }
    res.status(200).json(body);
  }
}
