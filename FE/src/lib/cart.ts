import type { Product } from './types';

/** Một dòng trong giỏ. Giá chỉ để HIỂN THỊ: khi đặt hàng backend lấy giá và tên từ catalog, không tin dữ liệu từ giỏ. */
export interface CartLine {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unit: string | null;
  price: number;
  quantity: number;
}

export interface CartState { lines: CartLine[] }

export const EMPTY_CART: CartState = { lines: [] };
/** Số lượng tối đa mỗi sản phẩm một đơn (giới hạn của API đặt hàng). */
export const MAX_QUANTITY = 1000;

type Addable = Pick<Product, 'id' | 'name' | 'slug' | 'imageUrl' | 'unit' | 'price'>;

const clamp = (n: number) => Math.min(MAX_QUANTITY, Math.max(0, Math.floor(n)));

/** Thêm sản phẩm; đã có thì cộng dồn số lượng (tối đa MAX_QUANTITY). */
export function addToCart(state: CartState, product: Addable, quantity = 1): CartState {
  const add = clamp(quantity);
  if (add <= 0) return state;
  const existing = state.lines.find((l) => l.productId === product.id);
  if (existing) {
    return { lines: state.lines.map((l) => (l.productId === product.id ? { ...l, quantity: clamp(l.quantity + add), price: product.price } : l)) };
  }
  return {
    lines: [...state.lines, {
      productId: product.id, name: product.name, slug: product.slug, imageUrl: product.imageUrl, unit: product.unit, price: product.price, quantity: add,
    }],
  };
}

/** Đặt số lượng; từ 0 trở xuống thì bỏ dòng. */
export function setQuantity(state: CartState, productId: string, quantity: number): CartState {
  const q = clamp(quantity);
  if (q <= 0) return removeFromCart(state, productId);
  return { lines: state.lines.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)) };
}

export function removeFromCart(state: CartState, productId: string): CartState {
  return { lines: state.lines.filter((l) => l.productId !== productId) };
}

export const cartCount = (state: CartState): number => state.lines.reduce((n, l) => n + l.quantity, 0);
export const cartSubtotal = (state: CartState): number => state.lines.reduce((s, l) => s + l.price * l.quantity, 0);

/**
 * Phí ship TẠM TÍNH để khách hình dung trước khi đặt (đồng giá, miễn phí từ ngưỡng). Số chính thức do backend tính lúc đặt hàng
 * theo cấu hình của cửa hàng và trả về trong đơn; nếu cấu hình đổi thì số này có thể lệch.
 */
export const SHIPPING_ESTIMATE = { flatFee: 30_000, freeThreshold: 500_000 } as const;

export function estimateShipping(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= SHIPPING_ESTIMATE.freeThreshold ? 0 : SHIPPING_ESTIMATE.flatFee;
}

/** Đọc giỏ từ bộ nhớ cục bộ, bỏ mọi dòng sai dạng (dữ liệu có thể bị sửa tay hoặc từ phiên bản cũ). */
export function parseCart(raw: string | null): CartState {
  if (!raw) return EMPTY_CART;
  try {
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!parsed || !Array.isArray(parsed.lines)) return EMPTY_CART;
    const lines: CartLine[] = [];
    for (const l of parsed.lines as Array<Record<string, unknown>>) {
      if (typeof l?.productId !== 'string' || typeof l.name !== 'string' || typeof l.price !== 'number' || !Number.isFinite(l.price)) continue;
      const quantity = clamp(Number(l.quantity));
      if (quantity <= 0) continue;
      lines.push({
        productId: l.productId, name: l.name, slug: typeof l.slug === 'string' ? l.slug : '', imageUrl: typeof l.imageUrl === 'string' ? l.imageUrl : null,
        unit: typeof l.unit === 'string' ? l.unit : null, price: Math.max(0, Math.round(l.price)), quantity,
      });
    }
    return { lines };
  } catch {
    return EMPTY_CART;
  }
}
