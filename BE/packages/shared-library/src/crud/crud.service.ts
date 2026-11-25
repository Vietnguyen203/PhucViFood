import { AppException } from '../api/errors';
import { PageResult } from '../api/response';
import { UUID_REGEX } from '../utils/uuid';
import { ListConfig, parseListQuery } from './query';

/** Phần của Prisma delegate (vd prisma.product) mà CRUD cần. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CrudDelegate<T = any> {
  findMany(args: any): Promise<T[]>;
  count(args: any): Promise<number>;
  findFirst(args: any): Promise<T | null>;
  create(args: any): Promise<T>;
  update(args: any): Promise<T>;
  delete(args: any): Promise<T>;
}

export interface CrudConfig extends ListConfig {
  /** Tên hiển thị trong thông báo lỗi, vd "Sản phẩm". */
  label?: string;
  /** Quan hệ include mặc định khi đọc. */
  include?: Record<string, unknown>;
}

/**
 * CRUD chung trên một Prisma delegate. Kế thừa để thêm quy tắc nghiệp vụ:
 * ghi đè toCreateInput/toUpdateInput/toResponse hoặc bọc các phương thức create/update/remove.
 */
export class PrismaCrudService<TEntity = any, TCreate = any, TUpdate = any> {
  constructor(
    protected readonly delegate: CrudDelegate<TEntity>,
    protected readonly config: CrudConfig,
  ) {}

  protected get label(): string { return this.config.label ?? 'Bản ghi'; }

  protected toCreateInput(dto: TCreate): any { return dto; }
  protected toUpdateInput(dto: TUpdate): any { return dto; }
  protected toResponse(entity: TEntity): any { return entity; }

  protected assertId(id: string): void {
    if (!UUID_REGEX.test(id)) throw AppException.validation([{ field: 'id', messages: ['id phải là UUID'] }]);
  }

  protected whereId(id: string, scope?: Record<string, unknown>): Record<string, unknown> {
    const and: Record<string, unknown>[] = [{ id }];
    if (this.config.baseWhere) and.push(this.config.baseWhere);
    if (scope) and.push(scope);
    if (this.config.softDeleteField) and.push({ [this.config.softDeleteField]: null });
    return { AND: and };
  }

  /**
   * `scope` là điều kiện giới hạn riêng cho từng lần gọi, luôn được áp dụng (vd { affiliateId } để CTV chỉ thấy
   * dữ liệu của mình). Khác `config.baseWhere` là điều kiện cố định cho cả service.
   */
  async list(query: Record<string, unknown>, scope?: Record<string, unknown>): Promise<PageResult<any>> {
    const baseWhere = scope ? (this.config.baseWhere ? { AND: [this.config.baseWhere, scope] } : scope) : this.config.baseWhere;
    const args = parseListQuery(query, { ...this.config, baseWhere });
    const [rows, total] = await Promise.all([
      this.delegate.findMany({ where: args.where, orderBy: args.orderBy, skip: args.skip, take: args.take, include: this.config.include }),
      this.delegate.count({ where: args.where }),
    ]);
    return new PageResult(rows.map((r) => this.toResponse(r)), total, args.page, args.pageSize);
  }

  protected async findOrThrow(id: string, scope?: Record<string, unknown>): Promise<TEntity> {
    this.assertId(id);
    const found = await this.delegate.findFirst({ where: this.whereId(id, scope), include: this.config.include });
    if (!found) throw AppException.notFound(`${this.label} không tồn tại`);
    return found;
  }

  async findOne(id: string, scope?: Record<string, unknown>): Promise<any> {
    return this.toResponse(await this.findOrThrow(id, scope));
  }

  async create(dto: TCreate): Promise<any> {
    const created = await this.delegate.create({ data: this.toCreateInput(dto), include: this.config.include });
    return this.toResponse(created);
  }

  async update(id: string, dto: TUpdate): Promise<any> {
    await this.findOrThrow(id);
    const updated = await this.delegate.update({ where: { id }, data: this.toUpdateInput(dto), include: this.config.include });
    return this.toResponse(updated);
  }

  /** Xóa mềm nếu có softDeleteField, ngược lại xóa hẳn. */
  async remove(id: string): Promise<{ id: string; deleted: true }> {
    await this.findOrThrow(id);
    if (this.config.softDeleteField) {
      await this.delegate.update({ where: { id }, data: { [this.config.softDeleteField]: new Date() } });
    } else {
      await this.delegate.delete({ where: { id } });
    }
    return { id, deleted: true };
  }
}
