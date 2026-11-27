import { useState } from "react";
import { useAdmin } from "./AdminContext";
import { Field, FormModal } from "./ui";

/** Đổi mật khẩu của chính mình (dùng chung cho khu quản trị và khu CTV). Các phiên khác bị đăng xuất, phiên này giữ nguyên. */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword, notify } = useAdmin();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [mismatch, setMismatch] = useState(false);
  return (
    <FormModal title="Đổi mật khẩu" submitLabel="Đổi mật khẩu" onClose={onClose}
      onSubmit={async () => {
        setMismatch(false);
        if (next !== again) { setMismatch(true); throw new Error("Mật khẩu nhập lại chưa khớp."); }
        await changePassword(current, next);
        notify("Đã đổi mật khẩu; các thiết bị khác phải đăng nhập lại");
      }}>
      {(err) => (
        <>
          <Field label="Mật khẩu hiện tại" error={err.currentPassword}><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus /></Field>
          <Field label="Mật khẩu mới" error={err.newPassword}><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu mới" error={mismatch ? "Chưa khớp mật khẩu mới" : undefined}><input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
        </>
      )}
    </FormModal>
  );
}
