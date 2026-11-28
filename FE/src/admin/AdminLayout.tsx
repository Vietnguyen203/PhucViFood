import { useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { AdminProvider, useAdmin } from "./AdminContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { IconButton } from "./icons";
import { formatTitle } from "../lib/pageTitle";
import { Toasts, useTableLabels } from "./ui";
import "./admin.css";

const NAV: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: "Tổng quan", items: [["/admin", "Tổng quan"], ["/admin/reports", "Báo cáo"]] },
  { group: "Bán hàng", items: [["/admin/orders", "Đơn hàng"], ["/admin/care-queue", "Hàng chờ CSKH"], ["/admin/customers", "Khách hàng"]] },
  { group: "Sản phẩm", items: [["/admin/products", "Sản phẩm"], ["/admin/categories", "Danh mục"]] },
  { group: "Nội dung", items: [["/admin/banners", "Banner trang chủ"], ["/admin/shortcuts", "Ô tròn trang chủ"], ["/admin/creators", "KOL / KOC"], ["/admin/videos", "Video trang chủ"]] },
  { group: "Cộng tác viên", items: [["/admin/affiliates", "Cộng tác viên"], ["/admin/commissions", "Hoa hồng"], ["/admin/payouts", "Đợt chi trả"], ["/admin/adjustments", "Khoản trừ"]] },
  { group: "Hệ thống", items: [["/admin/accounts", "Tài khoản"], ["/admin/settings", "Cấu hình bán hàng"]] },
];

function Shell() {
  const { session, logout } = useAdmin();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  const { pathname } = useLocation();
  const section = NAV.flatMap((g) => g.items).filter(([to]) => pathname === to || pathname.startsWith(to + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  useEffect(() => { document.title = formatTitle(`${section ? section[1] : "Quản trị"} (quản trị)`); }, [section]);
  if (!session) return <Navigate to="/login" replace />;
  return (
    <div className="ad-shell">
      <aside className={`ad-side${open ? " open" : ""}`}>
        <Link className="ad-brand" to="/" title="Về trang chủ cửa hàng" aria-label="Phúc Vị Quản trị, về trang chủ cửa hàng">Phúc Vị <small>Quản trị</small></Link>
        <nav onClick={() => setOpen(false)}>
          {NAV.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              {g.items.map(([to, label]) => <NavLink key={to} to={to} end={to === "/admin"} className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="ad-user">
          <span title={session.user.email}>{session.user.email}</span>
          <IconButton icon="key" label="Đổi mật khẩu" onClick={() => setPw(true)} />
          <IconButton icon="logout" label="Đăng xuất" onClick={() => void logout()} />
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top"><button className="ad-btn ad-menu" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">☰</button><span>Phúc Vị Foods · Quản trị</span></header>
        <main className="ad-content" ref={mainRef}><Outlet /></main>
      </div>
      {pw && <ChangePasswordModal onClose={() => setPw(false)} />}
      <Toasts />
    </div>
  );
}

/** Gốc của khu quản trị: cấp ngữ cảnh đăng nhập cho cả trang đăng nhập lẫn các trang trong khung. */
export function AdminRoot() {
  return <AdminProvider><Outlet /></AdminProvider>;
}

export default Shell;
