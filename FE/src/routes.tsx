import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./components/RootLayout";
import AccountPage from "./pages/AccountPage";
import { LoginPage, RegisterPage, RegisterPartnerPage } from "./pages/AuthPages";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/ForgotPages";
import { NewsDetailPage, NewsListPage } from "./pages/NewsPages";
import CartPage from "./pages/CartPage";
import CategoryPage from "./pages/CategoryPage";
import CheckoutPage from "./pages/CheckoutPage";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";
import { InfoPage, NotFoundPage } from "./pages/InfoPages";
import OrderPage from "./pages/OrderPage";
import { LegacyInfoRedirect, LegacyRedirect } from "./components/LegacyRedirect";
import { LEGACY_REDIRECTS } from "./lib/legacyRoutes";
import VnpayResultPage from "./pages/VnpayResultPage";
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
      { path: "/affiliate", Component: CTVPage },
      { path: "/products/:slug", Component: ProductPage },
      { path: "/search", Component: SearchPage },
      { path: "/categories/:slug", Component: CategoryPage },
      { path: "/cart", Component: CartPage },
      { path: "/wishlist", Component: WishlistPage },
      { path: "/news", Component: NewsListPage },
      { path: "/news/:slug", Component: NewsDetailPage },
      { path: "/login", Component: LoginPage },
      { path: "/register", Component: RegisterPage },
      { path: "/forgot-password", Component: ForgotPasswordPage },
      { path: "/reset-password", Component: ResetPasswordPage },
      { path: "/affiliate/register", Component: RegisterPartnerPage },
      { path: "/account", Component: AccountPage },
      { path: "/info/:page", Component: InfoPage },
      { path: "/checkout", Component: CheckoutPage },
      // Cổng VNPay đưa khách về đây sau khi thanh toán.
      { path: "/checkout/vnpay", Component: VnpayResultPage },
      // Tra cứu đơn bằng mã đơn + SĐT; có mã trên đường dẫn thì tự tra cứu khi vừa đặt hàng xong.
      { path: "/orders/:code?", Component: OrderPage },
      // Link giới thiệu của cộng tác viên: /r/{mã}?c={kênh}
      { path: "/r/:code", Component: ReferralLanding },
      // Đường dẫn lạ: báo không tìm thấy (các khu /admin và /affiliate/... khớp cụ thể hơn nên không bị ảnh hưởng).
      // Đường dẫn cũ (tiếng Việt) chuyển sang đường dẫn mới; trang thông tin đổi cả khóa.
      { path: "/thong-tin/:page", Component: LegacyInfoRedirect },
      ...LEGACY_REDIRECTS.map(([from, to]) => ({ path: from, element: <LegacyRedirect to={to} /> })),
      { path: "*", Component: NotFoundPage },
    ],
  },
  // Khu quản trị (ADMIN): không dùng khung cửa hàng (header, giỏ hàng).
  {
    path: "/admin",
    ...admin(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminRoot }))),
    children: [
      { path: "login", element: <Navigate to="/login" replace /> },
      {
        ...admin(() => import("./admin/AdminLayout")),
        children: [
          { index: true, ...admin(() => import("./admin/DashboardPage")) },
          { path: "reports", ...admin(() => import("./admin/ReportPage")) },
          { path: "settings", ...admin(() => import("./admin/ShopSettingsPage")) },
          { path: "orders", ...admin(() => import("./admin/OrdersPage")) },
          { path: "orders/:id", ...admin(() => import("./admin/OrderDetailPage")) },
          { path: "care-queue", ...admin(() => import("./admin/CskhPage")) },
          { path: "affiliates", ...admin(() => import("./admin/AffiliatesPage")) },
          { path: "commissions", ...admin(() => import("./admin/CommissionsPage")) },
          { path: "payouts", ...admin(() => import("./admin/PayoutsPage")) },
          { path: "adjustments", ...admin(() => import("./admin/AdjustmentsPage")) },
          { path: "customers", ...admin(() => import("./admin/CustomersPage")) },
          { path: "customers/:id", ...admin(() => import("./admin/CustomerDetailPage")) },
          { path: "accounts", ...admin(() => import("./admin/AccountsPage")) },
          { path: "banners", ...admin(() => import("./admin/BannersPage")) },
          { path: "creators", ...admin(() => import("./admin/CreatorsPage")) },
          { path: "videos", ...admin(() => import("./admin/VideosPage")) },
          { path: "shortcuts", ...admin(() => import("./admin/ShortcutsPage")) },
          { path: "products", ...admin(() => import("./admin/ProductsPage")) },
          { path: "categories", ...admin(() => import("./admin/CategoriesPage")) },
        ],
      },
    ],
  },
  // Khu cộng tác viên: đăng nhập, đăng ký và bảng điều khiển (trang giới thiệu /affiliate nằm trong khung cửa hàng).
  {
    // Cha không có path: /affiliate (trang giới thiệu) vẫn thuộc khung cửa hàng, chỉ các đường dẫn con dưới đây dùng khu CTV.
    ...admin(() => import("./partner/PartnerLayout").then((m) => ({ default: m.PartnerRoot }))),
    children: [
      {
        path: "/affiliate/account",
        ...admin(() => import("./partner/PartnerLayout")),
        children: [
          { index: true, ...admin(() => import("./partner/OverviewPage")) },
          { path: "links", ...admin(() => import("./partner/LinksPage")) },
          { path: "commissions", ...named(() => import("./partner/EarningsPages"), "CommissionsPage") },
          { path: "payouts", ...named(() => import("./partner/EarningsPages"), "PayoutsPage") },
          { path: "orders", ...named(() => import("./partner/EarningsPages"), "OrdersPage") },
          { path: "profile", ...admin(() => import("./partner/ProfilePage")) },
        ],
      },
    ],
  },
]);

export default router;
