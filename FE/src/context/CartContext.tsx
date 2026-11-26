import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import {
  addToCart, cartCount, cartSubtotal, EMPTY_CART, parseCart, removeFromCart, setQuantity, type CartState,
} from "../lib/cart";
import { safeStorage } from "../lib/storage";
import { trackEvent } from "../lib/tracking";
import type { Product } from "../lib/types";

const CART_KEY = "pv.cart";
const store = safeStorage();

type Action =
  | { type: "add"; product: Pick<Product, "id" | "name" | "slug" | "imageUrl" | "unit" | "price">; quantity: number }
  | { type: "set"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "clear" }
  | { type: "replace"; state: CartState };

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "add": return addToCart(state, action.product, action.quantity);
    case "set": return setQuantity(state, action.productId, action.quantity);
    case "remove": return removeFromCart(state, action.productId);
    case "clear": return EMPTY_CART;
    case "replace": return action.state;
  }
}

interface CartApi {
  cart: CartState;
  count: number;
  subtotal: number;
  /** Thêm vào giỏ, ghi nhận tương tác cho CTV (nếu khách vào qua link CTV) và mở ngăn kéo giỏ hàng. */
  add: (product: Pick<Product, "id" | "name" | "slug" | "imageUrl" | "unit" | "price">, quantity?: number) => void;
  setQty: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(reducer, undefined, () => parseCart(store.getItem(CART_KEY)));
  const [isOpen, setOpen] = useState(false);

  // Lưu giỏ mỗi khi đổi, và đồng bộ khi mở nhiều tab (sự kiện storage chỉ bắn ở tab khác).
  useEffect(() => { store.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) dispatch({ type: "replace", state: parseCart(e.newValue) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback<CartApi["add"]>((product, quantity = 1) => {
    dispatch({ type: "add", product, quantity });
    trackEvent(store, "ADD_TO_CART", product.id);
    setOpen(true);
  }, []);

  const value = useMemo<CartApi>(() => ({
    cart,
    count: cartCount(cart),
    subtotal: cartSubtotal(cart),
    add,
    setQty: (productId, quantity) => dispatch({ type: "set", productId, quantity }),
    remove: (productId) => dispatch({ type: "remove", productId }),
    clear: () => dispatch({ type: "clear" }),
    isOpen,
    openCart: () => setOpen(true),
    closeCart: () => setOpen(false),
  }), [cart, isOpen, add]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart phải được dùng bên trong CartProvider");
  return ctx;
}
