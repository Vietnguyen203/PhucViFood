import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { signedInTo } from "../lib/account";
import { normalizeSearch } from "../lib/catalog";
import { safeStorage } from "../lib/storage";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { HomeIcon } from "./Icon";

export function HomeHeader() {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { count, openCart } = useCart();
  const { count: wishCount } = useWishlist();
  const account = signedInTo(safeStorage());

  function onSearch(ev: FormEvent) {
    ev.preventDefault();
    const q = normalizeSearch(term);
    if (!q) return;
    setSearching(false);
    navigate(`/tim-kiem?q=${encodeURIComponent(q)}`);
  }
  return (
    <>
      <div className="home-topbar">
        <span>Miễn phí giao hàng cho đơn từ 500.000₫</span>
        <span>Hotline: 1900 6868</span>
      </div>
      <header className="home-header">
        <Link className="home-logo" to="/">
          <img src="/images/phuc-vi-logo-official-transparent.png" alt="Phúc Vị Foods" />
        </Link>
        <nav className={open ? "open" : ""}>
          <button className="home-nav-close" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <HomeIcon name="close" />
          </button>
          <a href="/#categories" onClick={() => setOpen(false)}>
            Danh mục
          </a>
          <a href="/#best-sellers" onClick={() => setOpen(false)}>
            Sản phẩm
          </a>
          <a href="/#brand-story" onClick={() => setOpen(false)}>
            Về Phúc Vị
          </a>
          <a href="/#news" onClick={() => setOpen(false)}>
            Tin tức
          </a>
          <Link to="/don-hang" onClick={() => setOpen(false)}>
            Tra cứu đơn
          </Link>
          <Link className="partner-nav-link" to="/ctv" onClick={() => setOpen(false)}>
            Cộng tác viên
          </Link>
        </nav>
        <div className="home-header-actions">
          {searching ? (
            <form className="shop-header-search" role="search" onSubmit={onSearch}>
              <input
                autoFocus type="search" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={100}
                placeholder="Tìm sản phẩm..." aria-label="Tìm sản phẩm" onKeyDown={(e) => { if (e.key === "Escape") setSearching(false); }}
              />
              <button type="submit" aria-label="Tìm"><HomeIcon name="search" size={18} /></button>
            </form>
          ) : (
            <button aria-label="Tìm kiếm" onClick={() => setSearching(true)}>
              <HomeIcon name="search" size={18} />
            </button>
          )}
          <Link className="home-wish" to="/yeu-thich" aria-label={`Yêu thích, ${wishCount} sản phẩm`}>
            <HomeIcon name="heart" size={18} />
            {wishCount > 0 && <span>{wishCount > 99 ? "99+" : wishCount}</span>}
          </Link>
          <Link className="home-account" to={account ?? "/dang-nhap"} aria-label={account ? "Tài khoản của tôi" : "Đăng nhập"} title={account ? "Tài khoản của tôi" : "Đăng nhập"}>
            <HomeIcon name="user" size={18} />
          </Link>
          <button className="home-cart" onClick={openCart} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
            <HomeIcon name="cart" size={18} />
            {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
          </button>
          <Link className="home-ctv-button" to="/ctv">
            Đăng ký CTV
          </Link>
          <button className="home-menu-button" onClick={() => setOpen(true)} aria-label="Mở menu">
            <HomeIcon name="menu" />
          </button>
        </div>
        {open && (
          <button
            className="home-nav-overlay"
            onClick={() => setOpen(false)}
            aria-label="Đóng menu"
          />
        )}
      </header>
    </>
  );
}
