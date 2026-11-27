import { useState } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { useAsync } from "../lib/useAsync";
import { ApiError } from "../lib/api";
import { AFFILIATE_STATUS_LABEL } from "../lib/admin/types";
import type { PartnerProfile } from "../lib/partner";
import { AdminProvider, useAdmin } from "../admin/AdminContext";
import { ChangePasswordModal } from "../admin/ChangePasswordModal";
import { ErrorBox, Loading, Toasts } from "../admin/ui";
import type { PartnerContext } from "./partnerContext";
import { ProfileForm } from "./ProfilePage";
import "../admin/admin.css";

const NAV: Array<[string, string]> = [
  ["/ctv/tai-khoan", "Tổng quan"], ["/ctv/tai-khoan/link", "Link giới thiệu"], ["/ctv/tai-khoan/hoa-hong", "Hoa hồng"],
  ["/ctv/tai-khoan/chi-tra", "Chi trả và khoản trừ"], ["/ctv/tai-khoan/don-hang", "Đơn hàng"], ["/ctv/tai-khoan/ho-so", "Hồ sơ"],
];

function Shell() {
  const { session, logout, adm } = useAdmin();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  // Hồ sơ CTV: 404 nghĩa là tài khoản mới đăng ký, chưa điền hồ sơ.
  const state = useAsync(async (signal) => {
    try { return (await adm<PartnerProfile>("/me/affiliate", { signal })).data; } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [session?.user.id]);
  if (!session) return <Navigate to="/dang-nhap" replace />;

  const profile = state.data;
  const active = profile?.status === "ACTIVE";
  return (
    <div className="ad-shell">
      <aside className={`ad-side${open ? " open" : ""}`}>
        <div className="ad-brand">Phúc Vị <small>Cộng tác viên</small></div>
        <nav onClick={() => setOpen(false)}>
          <div>
            {active && NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === "/ctv/tai-khoan"} className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>)}
            {!active && <NavLink to="/ctv/tai-khoan" className="active">Hồ sơ</NavLink>}
            <Link to="/">← Về cửa hàng</Link>
          </div>
        </nav>
        <div className="ad-user">
          <span title={session.user.email}>{session.user.email}</span>
          <button className="ad-btn" onClick={() => setPw(true)}>Đổi mật khẩu</button>
          <button className="ad-btn" onClick={() => void logout()}>Đăng xuất</button>
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top"><button className="ad-btn ad-menu" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">☰</button><span>Phúc Vị Foods · Cộng tác viên</span></header>
        <main className="ad-content">
          <ErrorBox error={state.error} onRetry={state.reload} />
          {state.loading && profile === undefined ? <Loading loading /> : null}
          {profile === null && <ProfileForm onSaved={state.reload} />}
          {profile && !active && (
            <>
              <div className={`ad-info`}>
                Trạng thái hồ sơ: <b>{AFFILIATE_STATUS_LABEL[profile.status] ?? profile.status}</b>.{" "}
                {profile.status === "PENDING" ? "Phúc Vị sẽ duyệt hồ sơ và liên hệ bạn. Sau khi được duyệt bạn có thể tạo link giới thiệu." : profile.status === "REJECTED" ? "Hồ sơ chưa được chấp nhận." : "Tài khoản đang tạm ngưng, vui lòng liên hệ Phúc Vị."}
                {profile.note && <> Ghi chú: {profile.note}</>}
              </div>
              <ProfileForm profile={profile} onSaved={state.reload} />
            </>
          )}
          {profile && active && <Outlet context={{ profile, reload: state.reload } satisfies PartnerContext} />}
        </main>
      </div>
      {pw && <ChangePasswordModal onClose={() => setPw(false)} />}
      <Toasts />
    </div>
  );
}

export function PartnerRoot() {
  return <AdminProvider role="AFFILIATE" sessionKey="pv.partner.session"><Outlet /></AdminProvider>;
}

export default Shell;
