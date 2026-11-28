import { useState } from "react";
import { Link } from "react-router";
import { signedInTo } from "../lib/account";
import { safeStorage } from "../lib/storage";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { HomeIcon } from "./Icon";
import { SearchBox } from "./SearchBox";

export function HomeHeader() {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const { count, openCart } = useCart();
  const { count: wishCount } = useWishlist();
  const account = signedInTo(safeStorage());

  return (
    <>
      <div className="home-topbar">
        <span>Miễn phí giao hàng cho đơn từ 500.000₫</span>
        <span>Hotline: 097 265 82 93</span>
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
          <Link to="/info/about" onClick={() => setOpen(false)}>
            Về Phúc Vị
          </Link>
          <Link to="/news" onClick={() => setOpen(false)}>
            Tin tức
          </Link>
          <Link to="/orders" onClick={() => setOpen(false)}>
            Tra cứu đơn
          </Link>
          <Link className="partner-nav-link" to="/affiliate" onClick={() => setOpen(false)}>
            Cộng tác viên
          </Link>
        </nav>
        <div className="home-header-actions">
          {searching ? (
            <SearchBox onClose={() => setSearching(false)} />
          ) : (
            <button aria-label="Tìm kiếm" onClick={() => setSearching(true)}>
              <HomeIcon name="search" size={18} />
            </button>
          )}
          <Link className="home-wish" to="/wishlist" aria-label={`Yêu thích, ${wishCount} sản phẩm`}>
            <HomeIcon name="heart" size={18} />
            {wishCount > 0 && <span>{wishCount > 99 ? "99+" : wishCount}</span>}
          </Link>
          <Link className="home-account" to={account ?? "/login"} aria-label={account ? "Tài khoản của tôi" : "Đăng nhập"} title={account ? "Tài khoản của tôi" : "Đăng nhập"}>
            <HomeIcon name="user" size={18} />
          </Link>
          <button className="home-cart" onClick={openCart} aria-label={`Giỏ hàng, ${count} sản phẩm`}>
            <HomeIcon name="cart" size={18} />
            {count > 0 && <span>{count > 99 ? "99+" : count}</span>}
          </button>
          <Link className="home-ctv-button" to="/affiliate">
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
