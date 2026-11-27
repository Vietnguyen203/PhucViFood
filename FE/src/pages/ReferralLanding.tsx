import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { safeStorage } from "../lib/storage";
import { landingTarget } from "../lib/referral";
import { trackReferralClick } from "../lib/tracking";
import "../home.css";

const store = safeStorage();

/**
 * Link giới thiệu của cộng tác viên: /r/{mã}?c={kênh}. Ghi nhận lượt bấm (backend kiểm tra mã còn hiệu lực), lưu cookie để gửi kèm
 * khi đặt hàng, rồi đưa khách về trang chủ. Mã sai hoặc lỗi mạng không làm hỏng việc xem hàng: khách vẫn về trang chủ như bình thường.
 */
export default function ReferralLanding() {
  const { code = "" } = useParams();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode chạy effect hai lần khi dev: chỉ ghi nhận một lượt bấm
    started.current = true;
    const channel = new URLSearchParams(search).get("c")?.trim().toLowerCase() || null;
    const normalized = code.trim().toLowerCase();
    const run = /^[a-z0-9]{1,32}$/.test(normalized)
      ? trackReferralClick(store, normalized, channel && /^[a-z0-9_-]{1,50}$/.test(channel) ? channel : null, `${pathname}${search}`)
      : Promise.resolve(false);
    // Chỉ chuyển tới trang sản phẩm trong cửa hàng (không chuyển tới địa chỉ tùy ý, tránh bị lợi dụng làm link chuyển hướng).
    const target = landingTarget(new URLSearchParams(search).get("to"));
    void run.finally(() => navigate(target, { replace: true }));
  }, [code, pathname, search, navigate]);

  return (
    <div className="home-page" style={{ display: "grid", placeItems: "center" }}>
      <p>Đang chuyển đến Phúc Vị Foods...</p>
    </div>
  );
}
