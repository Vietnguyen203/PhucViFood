import { useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useAsync } from "../lib/useAsync";
import { ApiError } from "../lib/api";
import { AFFILIATE_STATUS_LABEL } from "../lib/admin/types";
import type { PartnerProfile } from "../lib/partner";
import { AdminProvider, useAdmin } from "../admin/AdminContext";
import { ChangePasswordModal } from "../admin/ChangePasswordModal";
import { IconButton } from "../admin/icons";
import { formatTitle } from "../lib/pageTitle";
import { ErrorBox, Loading, Toasts, useTableLabels } from "../admin/ui";
import type { PartnerContext } from "./partnerContext";
import { ProfileForm } from "./ProfilePage";
import "../admin/admin.css";

const NAV: Array<[string, string]> = [
  ["/affiliate/account", "Tổng quan"], ["/affiliate/account/links", "Link giới thiệu"], ["/affiliate/account/commissions", "Hoa hồng"],
  ["/affiliate/account/payouts", "Chi trả và khoản trừ"], ["/affiliate/account/orders", "Đơn hàng"], ["/affiliate/account/profile", "Hồ sơ"],
];

function Shell() {
  const { session, logout, adm } = useAdmin();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  const { pathname } = useLocation();
  const section = NAV.filter(([to]) => pathname === to || pathname.startsWith(to + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  useEffect(() => { document.title = formatTitle(`${section ? section[1] : "Hồ sơ"} (cộng tác viên)`); }, [section]);
  // Hồ sơ CTV: 404 nghĩa là tài khoản mới đăng ký, chưa điền hồ sơ.
  const state = useAsync(async (signal) => {
    try { return (await adm<PartnerProfile>("/me/affiliate", { signal })).data; } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }, [session?.user.id]);
  if (!session) return <Navigate to="/login" replace />;

  const profile = state.data;
  const active = profile?.status === "ACTIVE";
  return (
    <div className="ad-shell">
      <aside className={`ad-side${open ? " open" : ""}`}>
        <Link className="ad-brand" to="/" title="Về trang chủ cửa hàng" aria-label="Phúc Vị Cộng tác viên, về trang chủ cửa hàng">Phúc Vị <small>Cộng tác viên</small></Link>
        <nav onClick={() => setOpen(false)}>
          <div>
            {active && NAV.map(([to, label]) => <NavLink key={to} to={to} end={to === "/affiliate/account"} className={({ isActive }) => (isActive ? "active" : "")}>{label}</NavLink>)}
            {!active && <NavLink to="/affiliate/account" className="active">Hồ sơ</NavLink>}
            <Link to="/">← Về cửa hàng</Link>
          </div>
        </nav>
        <div className="ad-user">
          <span title={session.user.email}>{session.user.email}</span>
          <IconButton icon="key" label="Đổi mật khẩu" onClick={() => setPw(true)} />
          <IconButton icon="logout" label="Đăng xuất" onClick={() => void logout()} />
        </div>
      </aside>
      <div className="ad-main">
        <header className="ad-top"><button className="ad-btn ad-menu" onClick={() => setOpen((o) => !o)} aria-label="Mở menu">☰</button><span>Phúc Vị Foods · Cộng tác viên</span></header>
        <main className="ad-content" ref={mainRef}>
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
