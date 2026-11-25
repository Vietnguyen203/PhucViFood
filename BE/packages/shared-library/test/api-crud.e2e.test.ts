import { Controller, Get, INestApplication, Module, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHealthController, setupApp } from '../src/api';
import { createCrudController, PrismaCrudService, type CrudDelegate } from '../src/crud';
import { uuidv7 } from '../src/utils';

// ───────── Delegate trong bộ nhớ, mô phỏng đủ phần Prisma mà CRUD dùng ─────────
type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    const value = row[key];
    if (cond === null) return value === null || value === undefined;
    if (cond instanceof Date || typeof cond !== 'object') return value === cond;
    return Object.entries(cond as Row).every(([op, arg]) => {
      switch (op) {
        case 'contains': return String(value).toLowerCase().includes(String(arg).toLowerCase());
        case 'in': return (arg as unknown[]).includes(value);
        case 'gt': return value > arg;
        case 'gte': return value >= arg;
        case 'lt': return value < arg;
        case 'lte': return value <= arg;
        default: return true;
      }
    });
  });
}

class MemoryDelegate implements CrudDelegate<Row> {
  rows: Row[] = [];
  async findMany({ where, orderBy, skip, take }: any) {
    const sorted = this.rows.filter((r) => matches(r, where ?? {})).sort((a, b) => {
      for (const o of orderBy ?? []) {
        const [k, dir] = Object.entries(o)[0] as [string, 'asc' | 'desc'];
        if (a[k] === b[k]) continue;
        return (a[k] > b[k] ? 1 : -1) * (dir === 'asc' ? 1 : -1);
      }
      return 0;
    });
    return sorted.slice(skip ?? 0, (skip ?? 0) + (take ?? sorted.length));
  }
  async count({ where }: any) { return this.rows.filter((r) => matches(r, where ?? {})).length; }
  async findFirst({ where }: any) { return this.rows.find((r) => matches(r, where)) ?? null; }
  async create({ data }: any) {
    const row = { id: uuidv7(), createdAt: new Date(Date.now() + this.rows.length), deletedAt: null, ...data };
    this.rows.push(row);
    return row;
  }
  async update({ where, data }: any) { return Object.assign(this.rows.find((r) => r.id === where.id)!, data); }
  async delete({ where }: any) {
    const i = this.rows.findIndex((r) => r.id === where.id);
    return this.rows.splice(i, 1)[0];
  }
}

// ───────── DTO + service nghiệp vụ kế thừa CRUD chung ─────────
class CreateProductDto {
  @IsString() @Length(2, 100) name!: string;
  @IsInt() @Min(0) price!: number; // VND
  @IsOptional() @IsBoolean() isVisible?: boolean;
}

class ProductService extends PrismaCrudService {
  // Ví dụ ghi đè: tiền lưu BigInt trong DB.
  protected override toCreateInput(dto: CreateProductDto) { return { ...dto, price: BigInt(dto.price) }; }
  protected override toUpdateInput(dto: Partial<CreateProductDto>) {
    return dto.price === undefined ? dto : { ...dto, price: BigInt(dto.price) };
  }
}

const PRODUCT_SERVICE = Symbol('PRODUCT_SERVICE');
const delegate = new MemoryDelegate();

@Controller('debug')
class DebugController {
  @Get('boom')
  boom(@Query('kind') kind?: string) {
    if (kind === 'prisma-unique') throw Object.assign(new Error('Unique constraint failed'), { name: 'PrismaClientKnownRequestError', code: 'P2002', meta: { target: ['sku'] } });
    if (kind === 'prisma-check') throw Object.assign(new Error('check failed'), { name: 'PrismaClientKnownRequestError', code: 'P2004' });
    throw new Error('mật khẩu DB là hunter2');
  }
}

@Module({
  controllers: [
    createCrudController({ path: 'products', service: PRODUCT_SERVICE, createDto: CreateProductDto }),
    createHealthController('test-service') as never,
    DebugController,
  ],
  providers: [{
    provide: PRODUCT_SERVICE,
    useValue: new ProductService(delegate, {
      label: 'Sản phẩm',
      sortableFields: ['createdAt', 'price', 'name'],
      filterableFields: { price: 'bigint', isVisible: 'boolean' },
      searchableFields: ['name'],
      softDeleteField: 'deletedAt',
    }),
  }],
})
class TestModule {}

let app: INestApplication;
let base: string;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { globalPrefix: 'api' });
  await app.listen(0);
  base = `${await app.getUrl()}`.replace('[::1]', 'localhost') + '/api';
});
afterAll(async () => { await app.close(); });

describe('API chuẩn + CRUD tự sinh (HTTP thật)', () => {
  const ids: string[] = [];

  it('GET /health', async () => {
    const r = await call('GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, data: { status: 'ok', service: 'test-service' } });
  });

  it('POST tạo mới: 201, phong bì success, tiền BigInt ra JSON là số', async () => {
    const names = ['Khô cá lóc', 'Mực khô', 'Tôm khô', 'Nem chua', 'Chè Thái'];
    const prices = [220_000, 390_000, 180_000, 85_000, 120_000];
    for (let i = 0; i < names.length; i++) {
      const r = await call('POST', '/products', { name: names[i], price: prices[i] });
      expect(r.status).toBe(201);
      expect(r.body.success).toBe(true);
      expect(r.body.data.price).toBe(prices[i]); // BigInt -> number
      ids.push(r.body.data.id);
    }
  });

  it('POST sai dữ liệu: 400 VALIDATION_FAILED kèm chi tiết theo trường', async () => {
    const r = await call('POST', '/products', { name: 'x', price: -5 });
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    const fields = r.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['name', 'price']);
  });

  it('POST trường lạ bị từ chối (không lờ đi)', async () => {
    const r = await call('POST', '/products', { name: 'Hợp lệ', price: 1000, role: 'ADMIN' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('GET danh sách: phân trang, meta, sắp xếp', async () => {
    const r = await call('GET', '/products?page=2&pageSize=2&sort=-price');
    expect(r.status).toBe(200);
    expect(r.body.meta.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(r.body.data.map((p: Row) => p.price)).toEqual([180_000, 120_000]); // 390k,220k | 180k,120k | 85k
  });

  it('GET tìm kiếm q và lọc theo khoảng giá', async () => {
    const q = await call('GET', '/products?q=KHÔ');
    expect(q.body.data.map((p: Row) => p.name).sort()).toEqual(['Khô cá lóc', 'Mực khô', 'Tôm khô']);
    const f = await call('GET', '/products?filter[price][gte]=100000&filter[price][lte]=200000&sort=price');
    expect(f.body.data.map((p: Row) => p.price)).toEqual([120_000, 180_000]);
  });

  it('GET query sai: 400 và nói rõ lý do', async () => {
    const r = await call('GET', '/products?sort=passwordHash&filter[secret]=1');
    expect(r.status).toBe(400);
    expect(r.body.error.details.length).toBe(2);
  });

  it('GET theo id; id không phải UUID => 400; không tồn tại => 404', async () => {
    expect((await call('GET', `/products/${ids[0]}`)).body.data.name).toBe('Khô cá lóc');
    expect((await call('GET', '/products/abc')).status).toBe(400);
    const nf = await call('GET', `/products/${uuidv7()}`);
    expect(nf.status).toBe(404);
    expect(nf.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Sản phẩm không tồn tại' });
  });

  it('PATCH cập nhật từng phần (không cần gửi đủ trường)', async () => {
    const r = await call('PATCH', `/products/${ids[3]}`, { price: 90_000 });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ name: 'Nem chua', price: 90_000 });
    expect((await call('PATCH', `/products/${ids[3]}`, { price: 1.5 })).status).toBe(400);
    expect((await call('PATCH', `/products/${uuidv7()}`, { price: 1 })).status).toBe(404);
  });

  it('DELETE xóa mềm: biến mất khỏi danh sách và GET trả 404', async () => {
    const r = await call('DELETE', `/products/${ids[4]}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: ids[4], deleted: true });
    expect((await call('GET', `/products/${ids[4]}`)).status).toBe(404);
    expect((await call('GET', '/products')).body.meta.pagination.total).toBe(4);
    expect(delegate.rows.find((x) => x.id === ids[4])?.deletedAt).toBeInstanceOf(Date); // dữ liệu vẫn còn
  });

  it('request id: sinh mới hoặc giữ x-request-id hợp lệ, có trong cả phản hồi lỗi', async () => {
    const generated = await call('GET', '/products');
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(generated.body.requestId).toBe(generated.headers.get('x-request-id'));
    const echoed = await call('GET', '/products/abc', undefined, { 'x-request-id': 'trace-abc-12345' });
    expect(echoed.headers.get('x-request-id')).toBe('trace-abc-12345');
    expect(echoed.body.requestId).toBe('trace-abc-12345');
    const unsafe = await call('GET', '/products', undefined, { 'x-request-id': 'a b<script>' });
    expect(unsafe.headers.get('x-request-id')).not.toContain('<');
  });

  it('lỗi Prisma được ánh xạ: P2002 => 409, P2004 => 422', async () => {
    const dup = await call('GET', '/debug/boom?kind=prisma-unique');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
    const chk = await call('GET', '/debug/boom?kind=prisma-check');
    expect(chk.status).toBe(422);
    expect(chk.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('lỗi không lường trước: 500, không lộ nội dung lỗi ra client', async () => {
    const r = await call('GET', '/debug/boom');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(r.body)).not.toContain('hunter2');
  });

  it('route không tồn tại: 404 theo phong bì lỗi chuẩn', async () => {
    const r = await call('GET', '/khong-co');
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
