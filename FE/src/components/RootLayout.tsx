import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { CartProvider } from "../context/CartContext";
import { CartDrawer } from "./CartDrawer";
import "../shop.css";

/** Chuyển trang thì cuộn lên đầu, trừ khi đường dẫn có neo (#...) để trình duyệt tự cuộn tới đúng mục. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/** Khung chung của mọi trang: giỏ hàng (dùng được ở mọi trang) và ngăn kéo giỏ hàng. */
export default function RootLayout() {
  // Giao diện cửa hàng thiết kế cho màn ~1280px (chữ 7-14px): màn lớn hơn thì phóng to theo bậc (xem cuối shop.css).
  // Chỉ cửa hàng; khu quản trị và khu CTV không dùng RootLayout nên không bị phóng.
  useEffect(() => {
    document.body.classList.add("store-scale");
    return () => document.body.classList.remove("store-scale");
  }, []);
  return (
    <CartProvider>
      <ScrollToTop />
      <Outlet />
      <CartDrawer />
    </CartProvider>
  );
}
