import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./components/RootLayout";
import CheckoutPage from "./pages/CheckoutPage";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";
import OrderPage from "./pages/OrderPage";
import ReferralLanding from "./pages/ReferralLanding";

/** Trang quản trị tải theo yêu cầu: khách mua hàng không phải tải mã của khu quản trị. */
const admin = <T extends { default: React.ComponentType }>(load: () => Promise<T>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { path: "/", Component: HomePage },
      { path: "/ctv", Component: CTVPage },
      { path: "/thanh-toan", Component: CheckoutPage },
      // Tra cứu đơn bằng mã đơn + SĐT; có mã trên đường dẫn thì tự tra cứu khi vừa đặt hàng xong.
      { path: "/don-hang/:code?", Component: OrderPage },
      // Link giới thiệu của cộng tác viên: /r/{mã}?c={kênh}
      { path: "/r/:code", Component: ReferralLanding },
    ],
  },
  // Khu quản trị (ADMIN): không dùng khung cửa hàng (header, giỏ hàng).
  {
    path: "/admin",
    ...admin(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminRoot }))),
    children: [
      { path: "login", ...admin(() => import("./admin/LoginPage")) },
      {
        ...admin(() => import("./admin/AdminLayout")),
        children: [
          { index: true, element: <Navigate to="/admin/don-hang" replace /> },
          { path: "don-hang", ...admin(() => import("./admin/OrdersPage")) },
          { path: "don-hang/:id", ...admin(() => import("./admin/OrderDetailPage")) },
          { path: "cskh", ...admin(() => import("./admin/CskhPage")) },
          { path: "ctv", ...admin(() => import("./admin/AffiliatesPage")) },
          { path: "hoa-hong", ...admin(() => import("./admin/CommissionsPage")) },
          { path: "chi-tra", ...admin(() => import("./admin/PayoutsPage")) },
          { path: "khoan-tru", ...admin(() => import("./admin/AdjustmentsPage")) },
          { path: "khach-hang", ...admin(() => import("./admin/CustomersPage")) },
          { path: "khach-hang/:id", ...admin(() => import("./admin/CustomerDetailPage")) },
          { path: "cai-dat", ...admin(() => import("./admin/SettingsPage")) },
          { path: "san-pham", ...admin(() => import("./admin/ProductsPage")) },
          { path: "danh-muc", ...admin(() => import("./admin/CategoriesPage")) },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default router;
