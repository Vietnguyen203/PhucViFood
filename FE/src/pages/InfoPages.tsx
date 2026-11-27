import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { SHIPPING_ESTIMATE } from "../lib/cart";
import { formatVnd } from "../lib/money";
import { useDocumentTitle } from "../lib/pageTitle";
import "../home.css";

interface Info { title: string; body: ReactNode }

/** Nội dung các trang thông tin tĩnh: /thong-tin/{khóa}. Số liệu phí ship lấy cùng nguồn với giỏ hàng. */
const PAGES: Record<string, Info> = {
  "gioi-thieu": {
    title: "Giới thiệu Phúc Vị Foods",
    body: (
      <>
        <p>Phúc Vị Foods tuyển chọn đặc sản và thực phẩm Việt từ các vùng miền, đóng gói cẩn thận và giao đến tận nhà. Chúng tôi muốn gìn giữ hương vị quen thuộc và trao gửi niềm vui trong từng sản phẩm.</p>
        <h2>Cam kết</h2>
        <ul>
          <li>Sản phẩm được chọn lọc, ghi rõ quy cách và giá bán minh bạch.</li>
          <li>Đóng gói kỹ, giao đúng sản phẩm bạn đặt.</li>
          <li>Hỗ trợ khách hàng qua điện thoại và email.</li>
        </ul>
        <h2>Chương trình cộng tác viên</h2>
        <p>Bạn có thể chia sẻ sản phẩm Phúc Vị và nhận hoa hồng khi khách mua qua link của bạn. <Link to="/ctv">Tìm hiểu chương trình CTV</Link>.</p>
      </>
    ),
  },
  "lien-he": {
    title: "Liên hệ",
    body: (
      <>
        <p>Cần hỗ trợ về đơn hàng, sản phẩm hoặc hợp tác? Liên hệ Phúc Vị theo các cách sau.</p>
        <dl className="shop-info-dl">
          <dt>Địa chỉ</dt><dd>Khu đồ thị The Manor Central Park, Xã Thanh Liệt, Huyện Thanh Trì, TP Hà Nội, Hanoi, Vietnam, Hanoi, Vietnam, Hanoi, Vietnam</dd>
          <dt>Điện thoại</dt><dd>097 265 82 93</dd>
          <dt>Email</dt><dd>hello@phucvifoods.vn</dd>
        </dl>
        <p>Khi hỏi về đơn hàng, vui lòng cung cấp mã đơn và số điện thoại đặt hàng để chúng tôi hỗ trợ nhanh hơn. Bạn cũng có thể tự <Link to="/don-hang">tra cứu đơn hàng</Link>.</p>
      </>
    ),
  },
  "giao-hang": {
    title: "Chính sách giao hàng",
    body: (
      <>
        <h2>Phí giao hàng</h2>
        <p>Đồng giá {formatVnd(SHIPPING_ESTIMATE.flatFee)} cho mỗi đơn. Đơn có tổng tiền sản phẩm từ {formatVnd(SHIPPING_ESTIMATE.freeThreshold)} được miễn phí giao hàng. Phí chính thức được chốt khi bạn đặt hàng và giữ nguyên cho đơn đó.</p>
        <h2>Theo dõi đơn hàng</h2>
        <p>Sau khi đặt hàng, bạn nhận mã đơn. Dùng mã đơn và số điện thoại đặt hàng để <Link to="/don-hang">tra cứu trạng thái</Link>: đã đặt, đã xác nhận, đang giao, đã giao.</p>
        <h2>Lưu ý</h2>
        <ul>
          <li>Vui lòng nhập đúng địa chỉ và số điện thoại để nhân viên giao hàng liên hệ.</li>
          <li>Đơn ở trạng thái đã đặt hoặc đã xác nhận có thể tự hủy tại trang tra cứu đơn; đơn đang giao thì vui lòng liên hệ hỗ trợ.</li>
        </ul>
      </>
    ),
  },
  "doi-tra": {
    title: "Chính sách đổi trả",
    body: (
      <>
        <p>Phúc Vị hỗ trợ xử lý khi sản phẩm bị hư hỏng, giao sai hoặc không đúng mô tả. Vui lòng liên hệ sớm sau khi nhận hàng, kèm mã đơn và hình ảnh sản phẩm.</p>
        <h2>Trường hợp được hỗ trợ</h2>
        <ul>
          <li>Sản phẩm bị vỡ, hỏng hoặc có dấu hiệu bất thường khi nhận.</li>
          <li>Giao sai sản phẩm hoặc thiếu số lượng so với đơn đặt.</li>
        </ul>
        <h2>Hoàn tiền</h2>
        <p>Đơn được duyệt hoàn trả sẽ được hoàn tiền theo hình thức bạn đã thanh toán. Với thực phẩm, chúng tôi không nhận đổi trả khi sản phẩm đã mở và sử dụng mà không có lỗi từ phía cửa hàng.</p>
        <p>Liên hệ hỗ trợ tại trang <Link to="/thong-tin/lien-he">Liên hệ</Link>.</p>
      </>
    ),
  },
  "thanh-toan": {
    title: "Hướng dẫn thanh toán",
    body: (
      <>
        <h2>Thanh toán khi nhận hàng (COD)</h2>
        <p>Bạn trả tiền mặt cho nhân viên giao hàng khi nhận sản phẩm.</p>
        <h2>Chuyển khoản ngân hàng</h2>
        <ol>
          <li>Chọn "Chuyển khoản" ở bước thanh toán và đặt hàng.</li>
          <li>Trang đơn hàng hiển thị ngân hàng, số tài khoản, chủ tài khoản và nội dung chuyển khoản.</li>
          <li>Chuyển đúng số tiền và đúng nội dung chuyển khoản.</li>
        </ol>
        <p>Đơn chuyển khoản được giữ hàng trong một thời hạn nhất định (hiện tại 24 giờ). Quá hạn mà chưa nhận được tiền, đơn tự hủy và hàng được trả về kho. <Link to="/don-hang">Tra cứu đơn hàng</Link> để xem hạn thanh toán.</p>
      </>
    ),
  },
};

export function InfoPage() {
  const { page = "" } = useParams();
  const info = Object.prototype.hasOwnProperty.call(PAGES, page) ? PAGES[page] : null;
  useDocumentTitle(info?.title);
  if (!info) return <NotFoundPage />;
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page shop-info">
        <p className="shop-muted"><Link to="/">Trang chủ</Link> / <span>{info.title}</span></p>
        <h1 className="shop-title">{info.title}</h1>
        <div className="shop-card shop-info-body">{info.body}</div>
      </main>
      <HomeFooter />
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle("Không tìm thấy trang");
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <div className="shop-card shop-empty-page">
          <h1 className="shop-title">Không tìm thấy trang</h1>
          <p>Đường dẫn bạn mở không tồn tại hoặc đã được chuyển đi.</p>
          <Link className="shop-btn primary" to="/">Về trang chủ</Link>
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}

export default InfoPage;
