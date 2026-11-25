import { Inject, Injectable } from '@nestjs/common';
import { AppException, ErrorCode } from '@phucvi/shared-library/api';
import { StockMovementReasonCode, StockMovementReasonCodec } from '@phucvi/shared-library/contracts';
import { PrismaCrudService } from '@phucvi/shared-library/crud';
import type { Prisma, StockMovement } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AdjustStockDto, ReleaseStockDto, ReserveStockDto } from './dto';

export const MOVEMENTS_SERVICE = Symbol('MOVEMENTS_SERVICE');

const isUnique = (e: unknown) => (e as { code?: string }).code === 'P2002';

export const toMovementView = (m: StockMovement) => ({
  id: m.id, productId: m.productId, delta: m.delta, reason: StockMovementReasonCodec.toName(m.reason),
  orderId: m.orderId, note: m.note, createdBy: m.createdBy, createdAt: m.createdAt,
});

/** Sổ cái tồn kho (đọc), dùng cho admin xem lịch sử của một sản phẩm. */
@Injectable()
export class MovementsService extends PrismaCrudService<StockMovement> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma.stockMovement, {
      label: 'Biến động tồn kho',
      sortableFields: ['createdAt'],
      filterableFields: { reason: { codec: StockMovementReasonCodec }, orderId: 'uuid', createdAt: 'date' },
    });
  }

  protected override toResponse(m: StockMovement) {
    return toMovementView(m);
  }
}

type ReleaseResult = { released: boolean; alreadyReleased?: boolean; reason?: 'NO_RESERVATION' };

/**
 * Tồn kho. Quy tắc:
 * - Giữ hàng (reserve) trừ tồn NGAY khi đặt, tất cả hoặc không gì cả; không bao giờ bán quá tồn kho.
 * - Mỗi đơn giữ hàng đúng một lần và trả hàng đúng một lần (idempotent), kể cả khi gọi song song.
 * - Mọi thay đổi đều có dòng trong stock_movements.
 */
@Injectable()
export class StockService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Gộp các dòng trùng sản phẩm, sắp theo productId để các giao dịch song song khóa theo cùng một thứ tự (tránh deadlock). */
  private merge(items: ReserveStockDto['items']): Array<[string, number]> {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }

  async reserve(dto: ReserveStockDto): Promise<unknown> {
    const wanted = this.merge(dto.items);
    try {
      return await this.prisma.$transaction((tx) => this.reserveInTx(tx, dto.orderId, wanted));
    } catch (e) {
      // Hai yêu cầu song song cho cùng một đơn: một bên thua ở unique index, thử lại sẽ thấy dòng đã có và trả bản phát lại.
      if (isUnique(e)) return this.prisma.$transaction((tx) => this.reserveInTx(tx, dto.orderId, wanted));
      throw e;
    }
  }

  private async reserveInTx(tx: Prisma.TransactionClient, orderId: string, wanted: Array<[string, number]>) {
    const existing = await tx.stockMovement.findMany({ where: { orderId, reason: StockMovementReasonCode.ORDER_PLACED } });
    if (existing.length > 0) {
      const same = existing.length === wanted.length && wanted.every(([id, qty]) => existing.some((m) => m.productId === id && -m.delta === qty));
      if (!same) throw AppException.conflict('Đơn này đã giữ hàng với nội dung khác');
      return this.snapshot(tx, orderId, wanted, true);
    }

    const ids = wanted.map(([id]) => id);
    const products = await tx.product.findMany({ where: { id: { in: ids }, deletedAt: null, isVisible: true, category: { isActive: true } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    const unavailable = ids.filter((id) => !byId.has(id));
    if (unavailable.length) {
      throw new AppException(ErrorCode.BUSINESS_RULE_VIOLATION, 'Có sản phẩm không còn được bán', unavailable.map((productId) => ({ productId, reason: 'NOT_AVAILABLE' })));
    }
    const insufficient = wanted.filter(([id, qty]) => byId.get(id)!.stockQuantity < qty);
    if (insufficient.length) {
      throw AppException.conflict('Không đủ tồn kho', insufficient.map(([productId, requested]) => ({ productId, requested, available: byId.get(productId)!.stockQuantity })));
    }

    for (const [productId, quantity] of wanted) {
      // Điều kiện stockQuantity >= quantity nằm trong chính câu UPDATE nên hai đơn song song không thể cùng lấy phần tồn cuối.
      const claimed = await tx.product.updateMany({ where: { id: productId, stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } });
      if (claimed.count === 0) {
        const now = await tx.product.findUnique({ where: { id: productId }, select: { stockQuantity: true } });
        throw AppException.conflict('Không đủ tồn kho', [{ productId, requested: quantity, available: now?.stockQuantity ?? 0 }]);
      }
    }
    await tx.stockMovement.createMany({
      data: wanted.map(([productId, quantity]) => ({ productId, delta: -quantity, reason: StockMovementReasonCode.ORDER_PLACED, orderId })),
    });
    return this.snapshot(tx, orderId, wanted, false);
  }

  /** Thông tin sản phẩm để ordering lưu snapshot vào đơn (tên, giá, quy cách). Phát lại trả giá hiện tại, không phải giá lúc giữ hàng. */
  private async snapshot(tx: Prisma.TransactionClient, orderId: string, wanted: Array<[string, number]>, replayed: boolean) {
    const products = await tx.product.findMany({ where: { id: { in: wanted.map(([id]) => id) } } });
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = wanted.map(([productId, quantity]) => {
      const p = byId.get(productId)!;
      return { productId, name: p.name, sku: p.sku, unit: p.unit, unitPrice: p.price, quantity, lineTotal: p.price * BigInt(quantity) };
    });
    return { orderId, replayed, items, subtotal: items.reduce((s, i) => s + i.lineTotal, 0n) };
  }

  /** Trả hàng về kho khi đơn bị hủy (hoặc khi ordering bồi hoàn vì tạo đơn thất bại). */
  async release(dto: ReleaseStockDto): Promise<ReleaseResult> {
    try {
      return await this.prisma.$transaction((tx) => this.releaseInTx(tx, dto.orderId));
    } catch (e) {
      if (isUnique(e)) return { released: true, alreadyReleased: true };
      throw e;
    }
  }

  async releaseInTx(tx: Prisma.TransactionClient, orderId: string): Promise<ReleaseResult> {
    const reserved = await tx.stockMovement.findMany({ where: { orderId, reason: StockMovementReasonCode.ORDER_PLACED }, orderBy: { productId: 'asc' } });
    if (reserved.length === 0) return { released: false, reason: 'NO_RESERVATION' };
    const already = await tx.stockMovement.count({ where: { orderId, reason: StockMovementReasonCode.ORDER_CANCELLED } });
    if (already > 0) return { released: true, alreadyReleased: true };

    for (const m of reserved) await tx.product.update({ where: { id: m.productId }, data: { stockQuantity: { increment: -m.delta } } });
    await tx.stockMovement.createMany({
      data: reserved.map((m) => ({ productId: m.productId, delta: -m.delta, reason: StockMovementReasonCode.ORDER_CANCELLED, orderId })),
    });
    return { released: true, alreadyReleased: false };
  }

  /** Admin điều chỉnh tồn kho (kiểm kho, nhập thêm, hàng hỏng). Không cho âm. */
  async adjust(productId: string, adminId: string, dto: AdjustStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!product) throw AppException.notFound('Sản phẩm không tồn tại');
      const claimed = await tx.product.updateMany({
        where: { id: productId, ...(dto.delta < 0 ? { stockQuantity: { gte: -dto.delta } } : {}) },
        data: { stockQuantity: { increment: dto.delta } },
      });
      if (claimed.count === 0) throw AppException.businessRule(`Tồn kho (${product.stockQuantity}) không đủ để giảm ${-dto.delta}`);
      const movement = await tx.stockMovement.create({
        data: { productId, delta: dto.delta, reason: StockMovementReasonCode.ADMIN_ADJUSTMENT, note: dto.note, createdBy: adminId },
      });
      const fresh = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stockQuantity: true } });
      return { productId, stockQuantity: fresh.stockQuantity, movement: toMovementView(movement) };
    });
  }
}
