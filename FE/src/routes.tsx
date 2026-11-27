import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./components/RootLayout";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NewsDetailPage, NewsListPage } from "./pages/NewsPages";
import CartPage from "./pages/CartPage";
import CategoryPage from "./pages/CategoryPage";
import CheckoutPage from "./pages/CheckoutPage";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";
import { InfoPage, NotFoundPage } from "./pages/InfoPages";
import OrderPage from "./pages/OrderPage";
import ProductPage from "./pages/ProductPage";
import ReferralLanding from "./pages/ReferralLanding";
import SearchPage from "./pages/SearchPage";
import WishlistPage from "./pages/WishlistPage";

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
      { path: "/yeu-thich", Component: WishlistPage },
      { path: "/tin-tuc", Component: NewsListPage },
      { path: "/tin-tuc/:slug", Component: NewsDetailPage },
      { path: "/dang-nhap", Component: LoginPage },
      { path: "/dang-ky", Component: RegisterPage },
      // Đường dẫn đăng nhập cũ của từng khu: dùng chung một trang đăng nhập
      { path: "/ctv/dang-nhap", element: <Navigate to="/dang-nhap" replace /> },
      { path: "/ctv/dang-ky", element: <Navigate to="/dang-ky" replace /> },
      { path: "/thong-tin/:page", Component: InfoPage },
      { path: "/thanh-toan", Component: CheckoutPage },
      // Tra cứu đơn bằng mã đơn + SĐT; có mã trên đường dẫn thì tự tra cứu khi vừa đặt hàng xong.
      { path: "/don-hang/:code?", Component: OrderPage },
      // Link giới thiệu của cộng tác viên: /r/{mã}?c={kênh}
      { path: "/r/:code", Component: ReferralLanding },
      // Đường dẫn lạ: báo không tìm thấy (các khu /admin và /ctv/... khớp cụ thể hơn nên không bị ảnh hưởng).
      { path: "*", Component: NotFoundPage },
    ],
  },
  // Khu quản trị (ADMIN): không dùng khung cửa hàng (header, giỏ hàng).
  {
    path: "/admin",
    ...admin(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminRoot }))),
    children: [
      { path: "login", element: <Navigate to="/dang-nhap" replace /> },
      {
        ...admin(() => import("./admin/AdminLayout")),
        children: [
          { index: true, ...admin(() => import("./admin/DashboardPage")) },
          { path: "bao-cao", ...admin(() => import("./admin/ReportPage")) },
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
]);

export default router;
