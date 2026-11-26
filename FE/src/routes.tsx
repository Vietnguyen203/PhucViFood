import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./components/RootLayout";
import CartPage from "./pages/CartPage";
import CategoryPage from "./pages/CategoryPage";
import CheckoutPage from "./pages/CheckoutPage";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";
import OrderPage from "./pages/OrderPage";
import ProductPage from "./pages/ProductPage";
import ReferralLanding from "./pages/ReferralLanding";
import SearchPage from "./pages/SearchPage";

/** Trang quản trị tải theo yêu cầu: khách mua hàng không phải tải mã của khu quản trị. */
const admin = <T extends { default: React.ComponentType }>(load: () => Promise<T>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});
/** Trang xuất theo tên (nhiều trang chung một file). */
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => ({
  lazy: async () => ({ Component: (await load())[name] }),
});

const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { path: "/", Component: HomePage },
      { path: "/ctv", Component: CTVPage },
      { path: "/san-pham/:slug", Component: ProductPage },
      { path: "/tim-kiem", Component: SearchPage },
      { path: "/danh-muc/:slug", Component: CategoryPage },
      { path: "/gio-hang", Component: CartPage },
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
          { index: true, ...admin(() => import("./admin/DashboardPage")) },
          { path: "cai-dat-cua-hang", ...admin(() => import("./admin/ShopSettingsPage")) },
          { path: "don-hang", ...admin(() => import("./admin/OrdersPage")) },
          { path: "don-hang/:id", ...admin(() => import("./admin/OrderDetailPage")) },
          { path: "cskh", ...admin(() => import("./admin/CskhPage")) },
          { path: "ctv", ...admin(() => import("./admin/AffiliatesPage")) },
          { path: "hoa-hong", ...admin(() => import("./admin/CommissionsPage")) },
          { path: "chi-tra", ...admin(() => import("./admin/PayoutsPage")) },
          { path: "khoan-tru", ...admin(() => import("./admin/AdjustmentsPage")) },
          { path: "khach-hang", ...admin(() => import("./admin/CustomersPage")) },
          { path: "khach-hang/:id", ...admin(() => import("./admin/CustomerDetailPage")) },
          { path: "tai-khoan", ...admin(() => import("./admin/AccountsPage")) },
          { path: "cai-dat", ...admin(() => import("./admin/SettingsPage")) },
          { path: "san-pham", ...admin(() => import("./admin/ProductsPage")) },
          { path: "danh-muc", ...admin(() => import("./admin/CategoriesPage")) },
        ],
      },
    ],
  },
  // Khu cộng tác viên: đăng nhập, đăng ký và bảng điều khiển (trang giới thiệu /ctv nằm trong khung cửa hàng).
  {
    // Cha không có path: /ctv (trang giới thiệu) vẫn thuộc khung cửa hàng, chỉ các đường dẫn con dưới đây dùng khu CTV.
    ...admin(() => import("./partner/PartnerLayout").then((m) => ({ default: m.PartnerRoot }))),
    children: [
      { path: "/ctv/dang-nhap", ...admin(() => import("./partner/AuthPage").then((m) => ({ default: () => <m.default mode="login" /> }))) },
      { path: "/ctv/dang-ky", ...admin(() => import("./partner/AuthPage").then((m) => ({ default: () => <m.default mode="register" /> }))) },
      {
        path: "/ctv/tai-khoan",
        ...admin(() => import("./partner/PartnerLayout")),
        children: [
          { index: true, ...admin(() => import("./partner/OverviewPage")) },
          { path: "link", ...admin(() => import("./partner/LinksPage")) },
          { path: "hoa-hong", ...named(() => import("./partner/EarningsPages"), "CommissionsPage") },
          { path: "chi-tra", ...named(() => import("./partner/EarningsPages"), "PayoutsPage") },
          { path: "don-hang", ...named(() => import("./partner/EarningsPages"), "OrdersPage") },
          { path: "ho-so", ...admin(() => import("./partner/ProfilePage")) },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default router;
