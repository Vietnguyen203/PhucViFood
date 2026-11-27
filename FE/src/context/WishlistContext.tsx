import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeStorage } from "../lib/storage";
import { hasWish, parseWishlist, removeWish, toggleWish, type WishItem } from "../lib/wishlist";

const KEY = "pv.wishlist";
const store = safeStorage();

interface WishlistApi {
  items: WishItem[];
  count: number;
  has: (productId: string) => boolean;
  toggle: (item: WishItem) => void;
  remove: (productId: string) => void;
}

const Ctx = createContext<WishlistApi | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishItem[]>(() => parseWishlist(store.getItem(KEY)));

  // Lưu mỗi khi đổi, và đồng bộ khi mở nhiều tab (sự kiện storage chỉ bắn ở tab khác).
  useEffect(() => { store.setItem(KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setItems(parseWishlist(e.newValue)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback((item: WishItem) => setItems((l) => toggleWish(l, item)), []);
  const remove = useCallback((productId: string) => setItems((l) => removeWish(l, productId)), []);
  const value = useMemo<WishlistApi>(() => ({ items, count: items.length, has: (id) => hasWish(items, id), toggle, remove }), [items, toggle, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishlistApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWishlist phải được dùng bên trong WishlistProvider");
  return v;
}
