import { Link, useLocation } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { describeError } from "../lib/api";
import { confirmVnpay } from "../lib/orders";
import { hasVnpayParams } from "../lib/payment";
import { useDocumentTitle } from "../lib/pageTitle";
import { useAsync } from "../lib/useAsync";
import "../home.css";

/** Cổng VNPay đưa khách về đây sau khi thanh toán: gửi nguyên kết quả cho máy chủ kiểm tra chữ ký, rồi báo thành công hoặc hướng dẫn thử lại. */
export default function VnpayResultPage() {
  useDocumentTitle("Kết quả thanh toán");
  const { search } = useLocation();
  const valid = hasVnpayParams(search);
  const { data, loading, error } = useAsync((signal) => (valid ? confirmVnpay(search, signal) : Promise.resolve(null)), [search]);
  const code = data?.orderCode ?? null;
  const orderLink = code ? `/orders/${encodeURIComponent(code)}` : "/orders";

  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">Kết quả thanh toán</h1>
        <div className="shop-card shop-empty-page" role="status" aria-live="polite">
          {!valid ? (
            <>
              <p>Không tìm thấy thông tin thanh toán. Nếu bạn vừa thanh toán, hãy tra cứu đơn hàng để kiểm tra.</p>
              <Link className="shop-btn primary" to="/orders">Tra cứu đơn hàng</Link>
            </>
          ) : loading ? (
            <p>Đang xác nhận thanh toán...</p>
          ) : error ? (
            <>
              <p>{describeError(error, "Chưa xác nhận được kết quả thanh toán.")} Nếu tài khoản ngân hàng đã bị trừ tiền, đơn sẽ được cập nhật trong ít phút; bạn có thể tra cứu đơn để kiểm tra.</p>
              <Link className="shop-btn primary" to="/orders">Tra cứu đơn hàng</Link>
            </>
          ) : data?.success ? (
            <>
              <h2>Thanh toán thành công</h2>
              <p>Cảm ơn bạn! Phúc Vị đã nhận được thanh toán cho đơn <b>{code}</b> và sẽ sớm chuẩn bị hàng.</p>
              <Link className="shop-btn primary" to={orderLink}>Xem đơn hàng</Link>
            </>
          ) : (
            <>
              <h2>{data?.valid === false ? "Không xác thực được thanh toán" : "Thanh toán chưa thành công"}</h2>
              <p>{data?.message ?? "Thanh toán chưa thành công."}{code && " Đơn vẫn được giữ cho bạn đến hết hạn thanh toán, bạn có thể thanh toán lại."}</p>
              <Link className="shop-btn primary" to={orderLink}>{code ? "Xem đơn và thanh toán lại" : "Tra cứu đơn hàng"}</Link>
            </>
          )}
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
