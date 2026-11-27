import { Link } from "react-router";
import { HomeIcon } from "./Icon";

export function HomeFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer-main">
        <div className="home-footer-brand">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
          <p>Gìn giữ hương vị Việt, trao gửi niềm vui trong từng sản phẩm.</p>
          <div>
            <a href="#facebook" aria-label="Facebook">
              <HomeIcon name="facebook" size={16} />
            </a>
            <a href="#instagram" aria-label="Instagram">
              <HomeIcon name="instagram" size={16} />
            </a>
            <a href="#tiktok" aria-label="TikTok">
              <HomeIcon name="tiktok" size={16} />
            </a>
            <a href="#youtube" aria-label="YouTube">
              <HomeIcon name="youtube" size={16} />
            </a>
          </div>
        </div>
        <div className="home-footer-column">
          <strong>Khám phá</strong>
          <a href="/#categories">Danh mục sản phẩm</a>
          <a href="/#best-sellers">Sản phẩm bán chạy</a>
          <a href="/#brand-story">Câu chuyện Phúc Vị</a>
          <a href="/#news">Tin tức & Blog</a>
        </div>
        <div className="home-footer-column">
          <strong>Hỗ trợ khách hàng</strong>
          <Link to="/thong-tin/giao-hang">Chính sách giao hàng</Link>
          <Link to="/thong-tin/doi-tra">Chính sách đổi trả</Link>
          <Link to="/thong-tin/thanh-toan">Hướng dẫn thanh toán</Link>
          <Link to="/thong-tin/lien-he">Liên hệ</Link>
          <Link to="/thong-tin/gioi-thieu">Về Phúc Vị</Link>
          <Link to="/ctv">Chương trình CTV</Link>
        </div>
        <div className="home-footer-column home-contact">
          <strong>Liên hệ</strong>
          <p>
            <HomeIcon name="pin" size={16} />
            128 Nguyễn Văn Linh, Quận 7, TP.HCM
          </p>
          <p>
            <HomeIcon name="phone" size={16} />
            1900 6868
          </p>
          <p>
            <HomeIcon name="mail" size={16} />
            hello@phucvifoods.vn
          </p>
        </div>
      </div>
      <div className="home-footer-bottom">
        <span>© 2025 Phúc Vị Foods. All rights reserved.</span>
        <span>Hương vị của hạnh phúc</span>
      </div>
    </footer>
  );
}
