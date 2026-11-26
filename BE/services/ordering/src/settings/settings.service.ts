import { Inject, Injectable } from '@nestjs/common';
import type { ShippingRule } from '@phucvi/shared-library/utils';
import { PrismaService } from '../prisma/prisma.service';

/** Đọc cấu hình từ bảng ordering.settings, có cache ngắn để không truy vấn mỗi request. */
@Injectable()
export class SettingsService {
  private cache: { loadedAt: number; values: Map<string, unknown> } | null = null;
  private static readonly TTL_MS = 60_000;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async all(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.cache.loadedAt < SettingsService.TTL_MS) return this.cache.values;
    const rows = await this.prisma.setting.findMany();
    this.cache = { loadedAt: Date.now(), values: new Map(rows.map((r) => [r.key, r.value])) };
    return this.cache.values;
  }

  async number(key: string, fallback: number): Promise<number> {
    const v = (await this.all()).get(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }

  async string(key: string): Promise<string | null> {
    const v = (await this.all()).get(key);
    return typeof v === 'string' && v ? v : null;
  }

  /** Số phút giữ hàng cho đơn chuyển khoản chưa thanh toán (mặc định 24 giờ). Giá trị sai hoặc nhỏ hơn 1 thì dùng mặc định. */
  async paymentHoldMinutes(): Promise<number> {
    const v = await this.number('payment.hold_minutes', 1_440);
    return v >= 1 ? Math.floor(v) : 1_440;
  }

  async shippingRule(): Promise<ShippingRule> {
    return { flatFee: await this.number('shipping.flat_fee', 30_000), freeThreshold: await this.number('shipping.free_threshold', 500_000) };
  }

  /** Thông tin chuyển khoản; null nếu công ty chưa cấu hình tài khoản nhận tiền. */
  async bankAccount(): Promise<{ bankName: string; accountNo: string; accountHolder: string } | null> {
    const [bankName, accountNo, accountHolder] = await Promise.all([
      this.string('payment.bank_name'), this.string('payment.bank_account_no'), this.string('payment.bank_account_holder'),
    ]);
    return bankName && accountNo && accountHolder ? { bankName, accountNo, accountHolder } : null;
  }
}
