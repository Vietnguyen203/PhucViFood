import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '@phucvi/shared-library/api';
import type { ShippingRule } from '@phucvi/shared-library/utils';
import { PrismaService } from '../prisma/prisma.service';

type Rule = { kind: 'int'; min: number; max: number; description: string } | { kind: 'text'; pattern?: RegExp; patternMessage?: string; max: number; description: string };

/** Các khóa admin được sửa, kèm kiểu và giới hạn. Khóa ngoài danh sách này không sửa được qua API. */
export const EDITABLE_SETTINGS: Record<string, Rule> = {
  'shipping.flat_fee': { kind: 'int', min: 0, max: 10_000_000, description: 'Phí ship đồng giá (VND)' },
  'shipping.free_threshold': { kind: 'int', min: 0, max: 1_000_000_000, description: 'Miễn phí ship khi tổng giá sản phẩm từ mức này (VND)' },
  'payment.hold_minutes': { kind: 'int', min: 1, max: 43_200, description: 'Số phút giữ hàng cho đơn chuyển khoản chưa thanh toán; quá hạn đơn tự bị hủy' },
  'payment.bank_name': { kind: 'text', max: 100, description: 'Ngân hàng nhận tiền chuyển khoản' },
  'payment.bank_account_no': { kind: 'text', max: 30, pattern: /^[0-9]{6,30}$/, patternMessage: 'số tài khoản gồm 6-30 chữ số', description: 'Số tài khoản nhận tiền' },
  'payment.bank_account_holder': { kind: 'text', max: 100, description: 'Tên chủ tài khoản' },
};

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

  /** Các cấu hình admin sửa được; khóa chưa có trong DB trả value null (đang dùng giá trị mặc định, riêng tài khoản ngân hàng là chưa cấu hình). */
  async listEditable() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: Object.keys(EDITABLE_SETTINGS) } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(EDITABLE_SETTINGS).map(([key, rule]) => {
      const row = byKey.get(key);
      return { key, kind: rule.kind, value: row?.value ?? null, description: row?.description ?? rule.description, updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt ?? null };
    });
  }

  async update(key: string, value: unknown, adminId: string) {
    const rule = EDITABLE_SETTINGS[key];
    if (!rule) throw AppException.notFound(`Không có cấu hình "${key}"; các khóa hợp lệ: ${Object.keys(EDITABLE_SETTINGS).join(', ')}`);
    const bad = (message: string) => AppException.validation([{ field: 'value', messages: [message] }]);
    let clean: number | string;
    if (rule.kind === 'int') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < rule.min || value > rule.max) throw bad(`value là số nguyên từ ${rule.min} đến ${rule.max}`);
      clean = value;
    } else {
      if (typeof value !== 'string') throw bad('value phải là chuỗi');
      clean = value.trim();
      if (!clean || clean.length > rule.max) throw bad(`value dài 1-${rule.max} ký tự`);
      if (rule.pattern && !rule.pattern.test(clean)) throw bad(rule.patternMessage ?? 'value không hợp lệ');
    }
    const saved = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: clean, description: rule.description, updatedBy: adminId },
      update: { value: clean, updatedBy: adminId },
    });
    this.cache = null; // áp dụng ngay trên bản này (các bản khác hết cache sau tối đa TTL_MS)
    return { key: saved.key, kind: rule.kind, value: saved.value, description: saved.description, updatedBy: saved.updatedBy, updatedAt: saved.updatedAt };
  }
}
