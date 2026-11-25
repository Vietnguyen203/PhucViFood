import { describe, expect, it } from 'vitest';
import { createEnvelope, EventTypes, isEventEnvelope } from '../src/contracts';
import { AppException } from '../src/api';
import { parseListQuery, type ListConfig } from '../src/crud';
import { qualifiedTable, quoteIdent } from '../src/messaging';

describe('contracts: phong bì sự kiện', () => {
  const envelope = createEnvelope({
    type: EventTypes.ORDER_STATUS_CHANGED,
    payload: {
      orderId: 'o', code: 'PV-1', fromStatus: 'DELIVERED', toStatus: 'COMPLETED', actorType: 'CUSTOMER',
      actorId: null, at: '2026-11-25T00:00:00Z', receivedBy: 'CUSTOMER',
    },
    source: 'ordering', aggregateType: 'Order', aggregateId: '01930000-0000-7000-8000-000000007001',
  });

  it('sinh id UUIDv7, version 1, thời gian ISO', () => {
    expect(envelope.id[14]).toBe('7');
    expect(envelope.version).toBe(1);
    expect(new Date(envelope.occurredAt).toISOString()).toBe(envelope.occurredAt);
  });
  it('nhận diện phong bì hợp lệ và từ chối rác', () => {
    expect(isEventEnvelope(JSON.parse(JSON.stringify(envelope)))).toBe(true);
    expect(isEventEnvelope({ ...envelope, type: 'unknown.event' })).toBe(false);
    expect(isEventEnvelope({ ...envelope, payload: null })).toBe(false);
    expect(isEventEnvelope('x')).toBe(false);
    expect(isEventEnvelope(null)).toBe(false);
  });
});

describe('CRUD: parseListQuery', () => {
  const config: ListConfig = {
    sortableFields: ['createdAt', 'price', 'name'],
    filterableFields: {
      status: { enum: ['ACTIVE', 'PENDING'] }, price: 'bigint', isVisible: 'boolean',
      categoryId: 'uuid', createdAt: 'date', stock: 'number',
    },
    searchableFields: ['name', 'sku'],
    softDeleteField: 'deletedAt',
  };

  it('mặc định: trang 1, 20 dòng, -createdAt, lọc xóa mềm', () => {
    const a = parseListQuery({}, config);
    expect(a).toMatchObject({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(a.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
    expect(a.where).toEqual({ AND: [{ deletedAt: null }] });
  });

  it('phân trang, giới hạn pageSize 100', () => {
    expect(parseListQuery({ page: '3', pageSize: '500' }, config)).toMatchObject({ page: 3, pageSize: 100, skip: 200, take: 100 });
  });

  it('sắp xếp nhiều trường', () => {
    expect(parseListQuery({ sort: '-price,name' }, config).orderBy).toEqual([{ price: 'desc' }, { name: 'asc' }, { id: 'asc' }]);
  });

  it('tìm kiếm không phân biệt hoa thường trên các trường searchable', () => {
    const { where } = parseListQuery({ q: ' khô cá ' }, config);
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { OR: [{ name: { contains: 'khô cá', mode: 'insensitive' } }, { sku: { contains: 'khô cá', mode: 'insensitive' } }] },
      ],
    });
  });

  it('lọc: bằng, danh sách, khoảng, ép kiểu', () => {
    const { where } = parseListQuery({
      filter: { status: 'ACTIVE,PENDING', price: { gte: '100000', lte: '300000' }, isVisible: 'true', stock: '5' },
    }, config);
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { status: { in: ['ACTIVE', 'PENDING'] } },
        { price: { gte: 100000n, lte: 300000n } },
        { isVisible: true },
        { stock: 5 },
      ],
    });
  });

  it('hiểu khóa ngoặc vuông phẳng (Express 5/Fastify) và chặn nhiễm prototype', () => {
    const { where } = parseListQuery({ 'filter[price][gte]': '100', 'filter[status]': 'ACTIVE', '__proto__[x]': '1' }, config);
    expect(where).toEqual({ AND: [{ deletedAt: null }, { price: { gte: 100n } }, { status: 'ACTIVE' }] });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('baseWhere luôn được áp dụng (vd giới hạn theo CTV)', () => {
    const { where } = parseListQuery({}, { ...config, baseWhere: { affiliateId: 'x' } });
    expect(where).toEqual({ AND: [{ affiliateId: 'x' }, { deletedAt: null }] });
  });

  it.each([
    ['sắp xếp trường không cho phép', { sort: 'passwordHash' }],
    ['lọc trường không cho phép', { filter: { secret: '1' } }],
    ['enum sai', { filter: { status: 'HACKED' } }],
    ['số sai', { filter: { stock: 'abc' } }],
    ['bigint sai', { filter: { price: '1.5' } }],
    ['uuid sai', { filter: { categoryId: 'nope' } }],
    ['ngày sai', { filter: { createdAt: { gte: 'hôm qua' } } }],
    ['toán tử lạ', { filter: { price: { regex: '.*' } } }],
    ['so sánh trên enum', { filter: { status: { gte: 'A' } } }],
    ['page sai', { page: '0' }],
    ['pageSize sai', { pageSize: 'x' }],
    ['filter không phải object', { filter: 'status' }],
  ])('từ chối: %s', (_name, query) => {
    try {
      parseListQuery(query as Record<string, unknown>, config);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('messaging: an toàn SQL cho tên schema/bảng', () => {
  it('chấp nhận định danh hợp lệ', () => {
    expect(qualifiedTable({ schema: 'ordering' }, 'outbox_events')).toBe('"ordering"."outbox_events"');
    expect(qualifiedTable({ schema: 'user', table: 'x_1' }, 'outbox_events')).toBe('"user"."x_1"');
  });
  it.each(['a"; DROP TABLE x;--', 'Order', '1abc', '', 'a-b', 'a b'])('từ chối %j', (name) => {
    expect(() => quoteIdent(name)).toThrow();
  });
});
