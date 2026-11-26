import { useState } from "react";
import type { PartnerProfile } from "../lib/partner";
import { AFFILIATE_STATUS_LABEL } from "../lib/admin/types";
import { useAdmin } from "../admin/AdminContext";
import { ApiError, describeError } from "../lib/api";
import { Field, fieldErrors, fmtBps, fmtDate } from "../admin/ui";
import { usePartner } from "./partnerContext";

/** Lập hồ sơ (chưa có) hoặc sửa thông tin nhận tiền (đã có). Mã giới thiệu đặt một lần, không đổi được. */
export function ProfileForm({ profile, onSaved }: { profile?: PartnerProfile; onSaved: () => void }) {
  const { adm, notify } = useAdmin();
  const [f, setF] = useState({
    fullName: profile?.fullName ?? "", phone: profile?.phone ?? "", referralCode: profile?.referralCode ?? "",
    bankName: profile?.bankName ?? "", bankAccountNo: profile?.bankAccountNo ?? "", bankAccountHolder: profile?.bankAccountHolder ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(null); setErrors({});
    try {
      const bank = { bankName: f.bankName.trim() || undefined, bankAccountNo: f.bankAccountNo.trim() || undefined, bankAccountHolder: f.bankAccountHolder.trim() || undefined };
      if (profile) await adm("/me/affiliate", { method: "PATCH", body: { fullName: f.fullName.trim(), ...bank } });
      else await adm("/me/affiliate", { method: "POST", body: { fullName: f.fullName.trim(), phone: f.phone.trim(), referralCode: f.referralCode.trim().toLowerCase(), ...bank } });
      notify(profile ? "Đã lưu hồ sơ" : "Đã gửi hồ sơ, chờ Phúc Vị duyệt");
      onSaved();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(fe);
      setMessage(Object.keys(fe).length > 0 ? "Vui lòng kiểm tra lại các trường được đánh dấu." : e instanceof ApiError && e.status === 409 ? "Mã giới thiệu hoặc số điện thoại đã được dùng." : describeError(e));
    } finally { setBusy(false); }
  }

  return (
    <form className="ad-card" onSubmit={save} noValidate style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>{profile ? "Hồ sơ cộng tác viên" : "Hoàn tất hồ sơ cộng tác viên"}</h2>
      {!profile && <p className="ad-muted">Điền thông tin để Phúc Vị duyệt. Mã giới thiệu dùng trong link của bạn và không đổi được sau này.</p>}
      <div className="ad-grid2">
        <Field label="Họ và tên *" error={errors.fullName}><input value={f.fullName} onChange={(e) => set("fullName", e.target.value)} maxLength={100} /></Field>
        <Field label="Số điện thoại *" error={errors.phone}><input value={f.phone} disabled={!!profile} onChange={(e) => set("phone", e.target.value)} inputMode="tel" /></Field>
        <Field label="Mã giới thiệu *" error={errors.referralCode} hint="4-12 ký tự chữ thường và số."><input value={f.referralCode} disabled={!!profile} onChange={(e) => set("referralCode", e.target.value)} autoCapitalize="none" maxLength={12} /></Field>
      </div>
      <h2>Tài khoản nhận hoa hồng</h2>
      <div className="ad-grid2">
        <Field label="Ngân hàng" error={errors.bankName}><input value={f.bankName} onChange={(e) => set("bankName", e.target.value)} maxLength={100} /></Field>
        <Field label="Số tài khoản" error={errors.bankAccountNo} hint="6-30 chữ số."><input value={f.bankAccountNo} onChange={(e) => set("bankAccountNo", e.target.value)} inputMode="numeric" /></Field>
        <Field label="Chủ tài khoản" error={errors.bankAccountHolder}><input value={f.bankAccountHolder} onChange={(e) => set("bankAccountHolder", e.target.value)} maxLength={100} /></Field>
      </div>
      {message && <p className="ad-error" role="alert">{message}</p>}
      <button className="ad-btn primary" type="submit" disabled={busy}>{busy ? "Đang lưu..." : profile ? "Lưu thay đổi" : "Gửi hồ sơ"}</button>
    </form>
  );
}

export default function ProfilePage() {
  const { profile, reload } = usePartner();
  return (
    <>
      <div className="ad-head"><h1>Hồ sơ</h1></div>
      <dl className="ad-dl ad-card" style={{ marginBottom: 14 }}>
        <dt>Trạng thái</dt><dd>{AFFILIATE_STATUS_LABEL[profile.status] ?? profile.status}</dd>
        <dt>Hợp đồng</dt><dd>{profile.contractStart ? `${fmtDate(profile.contractStart)} → ${profile.contractEnd ? fmtDate(profile.contractEnd) : "không giới hạn"}` : "—"}</dd>
        <dt>Tỷ lệ hoa hồng</dt><dd>{profile.commissionRateBps != null ? fmtBps(profile.commissionRateBps) : "Mặc định"}</dd>
      </dl>
      <ProfileForm profile={profile} onSaved={reload} />
    </>
  );
}
