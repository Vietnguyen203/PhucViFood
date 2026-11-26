import { createBrowserRouter, Navigate } from "react-router";
import RootLayout from "./components/RootLayout";
import CheckoutPage from "./pages/CheckoutPage";
import CTVPage from "./pages/CTVPage";
import HomePage from "./pages/HomePage";
import OrderPage from "./pages/OrderPage";
import ReferralLanding from "./pages/ReferralLanding";

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
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default router;
