import { api, type PageMeta } from './api';
import type { Category, Product } from './types';

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  return (await api<Category[]>('/public/categories', { signal })).data;
}

export interface ProductQuery {
  categoryId?: string;
  /** Lọc theo giá bán (VND), bao gồm hai đầu. */
  minPrice?: number;
  maxPrice?: number;
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
  if (query.minPrice !== undefined) params.set('filter[price][gte]', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('filter[price][lte]', String(query.maxPrice));
  if (query.q?.trim()) params.set('q', query.q.trim());
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 8));
  params.set('sort', query.sort ?? '-createdAt');
  const r = await api<Product[]>(`/public/products?${params.toString()}`, { signal });
  const total = r.data.length;
  return { items: r.data, pagination: r.meta?.pagination ?? { page: 1, pageSize: total, total, totalPages: 1 } };
}

/** Chi tiết một sản phẩm theo slug (đường dẫn thân thiện). 404 nếu không có hoặc đã ngừng bán. */
export async function fetchProductBySlug(slug: string, signal?: AbortSignal): Promise<Product> {
  return (await api<Product>(`/public/products/${encodeURIComponent(slug)}`, { signal })).data;
}

/** Từ khóa tìm kiếm gọn: bỏ khoảng trắng thừa, tối đa 100 ký tự. Rỗng nghĩa là không tìm. */
export function normalizeSearch(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/** Sản phẩm cùng danh mục (trừ chính nó) để gợi ý ở trang chi tiết. */
export async function fetchRelated(product: Pick<Product, 'id' | 'category'>, limit = 4, signal?: AbortSignal): Promise<Product[]> {
  if (!product.category) return [];
  const { items } = await fetchProducts({ categoryId: product.category.id, pageSize: limit + 1 }, signal);
  return items.filter((p) => p.id !== product.id).slice(0, limit);
}
