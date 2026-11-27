import { useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router";
import { AdminProvider, useAdmin } from "./AdminContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { Toasts } from "./ui";
import "./admin.css";

const NAV: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: "Tổng quan", items: [["/admin", "Tổng quan"]] },
  { group: "Bán hàng", items: [["/admin/don-hang", "Đơn hàng"], ["/admin/cskh", "Hàng chờ CSKH"], ["/admin/khach-hang", "Khách hàng"]] },
  { group: "Sản phẩm", items: [["/admin/san-pham", "Sản phẩm và tồn kho"], ["/admin/danh-muc", "Danh mục"]] },
  { group: "Cộng tác viên", items: [["/admin/ctv", "Cộng tác viên"], ["/admin/hoa-hong", "Hoa hồng"], ["/admin/chi-tra", "Đợt chi trả"], ["/admin/khoan-tru", "Khoản trừ"]] },
  { group: "Hệ thống", items: [["/admin/tai-khoan", "Tài khoản"], ["/admin/cai-dat-cua-hang", "Cấu hình bán hàng"], ["/admin/cai-dat", "Ngưỡng khách và nhật ký xuất"]] },
];

function Shell() {
  const { session, logout } = useAdmin();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  if (!session) return <Navigate to="/dang-nhap" replace />;
  return (
    <div className="ad-shell">
      <aside className={`ad-side${open ? " open" : ""}`}>
        <div className="ad-brand">Phúc Vị <small>Quản trị</small></div>
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
          <button className="ad-btn" onClick={() => setPw(true)}>Đổi mật khẩu</button>
          <button className="ad-btn" onClick={() => void logout()}>Đăng xuất</button>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top"><button className="ad-btn ad-menu" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">☰</button><span>Phúc Vị Foods · Quản trị</span></header>
        <main className="ad-content"><Outlet /></main>
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
