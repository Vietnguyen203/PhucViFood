import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { makeUniqueSlug } from '../../src/common/validators';
import { loadConfig } from '../../src/config/app-config';
import { CreateProductDto, UpdateProductDto } from '../../src/products/dto';
import { discountPercent } from '../../src/products/products.service';
import { AdjustStockDto, ReserveStockDto } from '../../src/stock/dto';
import { plainToInstance } from 'class-transformer';

const env = {
  CATALOG_DATABASE_URL: 'postgresql://x', RABBITMQ_URL: 'amqp://x',
  JWT_ACCESS_SECRET: 'a'.repeat(32), INTERNAL_API_KEY: 'k'.repeat(24),
};

describe('loadConfig', () => {
  it('đọc cấu hình hợp lệ với giá trị mặc định', () => {
    expect(loadConfig(env)).toMatchObject({ port: 3003, eventQueue: 'catalog.stock', relayEnabled: true });
  });
  it('báo tất cả lỗi một lượt', () => {
    expect(() => loadConfig({ INTERNAL_API_KEY: 'x', PORT: 'abc' })).toThrowError(
      /CATALOG_DATABASE_URL[\s\S]*RABBITMQ_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*INTERNAL_API_KEY[\s\S]*PORT/,
    );
  });
});

describe('discountPercent', () => {
  it('tính phần trăm giảm, làm tròn xuống', () => {
    expect(discountPercent(220_000n, 250_000n)).toBe(12);
    expect(discountPercent(180_000n, 200_000n)).toBe(10);
    expect(discountPercent(1n, 3n)).toBe(66);
  });
  it('không giảm giá thì 0', () => {
    expect(discountPercent(100n, null)).toBe(0);
    expect(discountPercent(100n, 100n)).toBe(0);
    expect(discountPercent(100n, 50n)).toBe(0);
    expect(discountPercent(0n, 0n)).toBe(0);
  });
});

describe('makeUniqueSlug', () => {
  it('thêm số khi trùng, dùng fallback khi rỗng', async () => {
    const taken = new Set(['kho-ca', 'kho-ca-2']);
    expect(await makeUniqueSlug('kho-ca', 'sp', async (s) => taken.has(s))).toBe('kho-ca-3');
    expect(await makeUniqueSlug('moi', 'sp', async (s) => taken.has(s))).toBe('moi');
    expect(await makeUniqueSlug('', 'san-pham', async () => false)).toBe('san-pham');
  });
});

const errors = async (dto: object) => (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property).sort();
const product = (over: object = {}) => plainToInstance(CreateProductDto, {
  categoryId: '01930000-0000-7000-8000-000000004001', name: ' Khô cá ', price: 220000, ...over,
});

describe('DTO sản phẩm', () => {
  it('hợp lệ, tên được cắt khoảng trắng', async () => {
    const dto = product({ slug: 'Kho-Ca', sku: 'KCL-500', imageUrl: 'https://cdn.example.com/a.jpg', originalPrice: 250000, stockQuantity: 10 });
    expect(await errors(dto)).toEqual([]);
    expect(dto.name).toBe('Khô cá');
    expect(dto.slug).toBe('kho-ca'); // slug về chữ thường
  });

  it.each([
    ['giá âm', { price: -1 }, 'price'],
    ['giá thập phân', { price: 100.5 }, 'price'],
    ['giá quá lớn', { price: 2_000_000_000 }, 'price'],
    ['slug sai', { slug: 'Kho Ca!' }, 'slug'],
    ['SKU có ký tự lạ', { sku: 'a b' }, 'sku'],
    ['ảnh không phải URL', { imageUrl: 'anh.jpg' }, 'imageUrl'],
    ['danh mục không phải UUID', { categoryId: 'abc' }, 'categoryId'],
    ['tồn kho âm', { stockQuantity: -1 }, 'stockQuantity'],
  ])('từ chối: %s', async (_n, patch, field) => {
    expect(await errors(product(patch))).toContain(field);
  });

  it('cập nhật không nhận stockQuantity (tồn kho chỉ đổi qua sổ cái)', async () => {
    const dto = plainToInstance(UpdateProductDto, { price: 1000, stockQuantity: 5 });
    expect(await errors(dto)).toContain('stockQuantity');
  });
});

describe('DTO tồn kho', () => {
  it('giữ hàng: cần ít nhất 1 dòng, số lượng nguyên dương, productId là UUID', async () => {
    const ok = plainToInstance(ReserveStockDto, { orderId: '01930000-0000-7000-8000-000000007001', items: [{ productId: '01930000-0000-7000-8000-000000005001', quantity: 2 }] });
    expect(await errors(ok)).toEqual([]);
    expect(await errors(plainToInstance(ReserveStockDto, { orderId: ok.orderId, items: [] }))).toContain('items');
    const bad = plainToInstance(ReserveStockDto, { orderId: ok.orderId, items: [{ productId: 'x', quantity: 0 }] });
    expect(await errors(bad)).toContain('items');
  });

  it('điều chỉnh: delta khác 0, bắt buộc có lý do', async () => {
    expect(await errors(plainToInstance(AdjustStockDto, { delta: 5, note: 'Nhập thêm' }))).toEqual([]);
    expect(await errors(plainToInstance(AdjustStockDto, { delta: 0, note: 'Nhập thêm' }))).toContain('delta');
    expect(await errors(plainToInstance(AdjustStockDto, { delta: 5 }))).toContain('note');
    expect(await errors(plainToInstance(AdjustStockDto, { delta: 5, note: 'a' }))).toContain('note');
  });
});
