import { api, type PageMeta } from './api';
import type { Category, Product } from './types';

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return (await api<Category[]>('/public/categories', { signal })).data;
}

export interface ProductQuery {
  categoryId?: string;
  /** Tìm theo tên hoặc mô tả. */
  q?: string;
  page?: number;
  pageSize?: number;
  /** Mặc định mới nhất trước. */
  sort?: 'createdAt' | '-createdAt' | 'price' | '-price' | 'name' | '-name';
}

export interface ProductPage { items: Product[]; pagination: PageMeta }

/** Chỉ sản phẩm đang bán và thuộc danh mục đang bật (backend lọc sẵn). */
export async function fetchProducts(query: ProductQuery = {}, signal?: AbortSignal): Promise<ProductPage> {
  const params = new URLSearchParams();
  if (query.categoryId) params.set('filter[categoryId]', query.categoryId);
  if (query.q?.trim()) params.set('q', query.q.trim());
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 8));
  params.set('sort', query.sort ?? '-createdAt');
  const r = await api<Product[]>(`/public/products?${params.toString()}`, { signal });
  const total = r.data.length;
  return { items: r.data, pagination: r.meta?.pagination ?? { page: 1, pageSize: total, total, totalPages: 1 } };
}
