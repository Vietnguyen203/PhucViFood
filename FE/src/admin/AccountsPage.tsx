import { useState } from "react";
import { USER_ROLE_LABEL, USER_STATUS_LABEL, type AdminUser } from "../lib/admin/types";
import { useAdmin } from "./AdminContext";
import { Badge, ConfirmModal, ErrorBox, Field, FilterBar, FormModal, Loading, Pager, SortHeader, fmtDateTime, useList, useListFilters } from "./ui";

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{Object.entries(USER_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>;
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { adm, notify } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ADMIN");
  return (
    <FormModal title="Tạo tài khoản" submitLabel="Tạo" onClose={onClose}
      onSubmit={async () => { await adm("/users", { method: "POST", body: { email: email.trim(), password, role } }); notify("Đã tạo tài khoản"); onDone(); }}>
      {(err) => (
        <>
          <Field label="Email *" error={err.email}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <Field label="Mật khẩu *" error={err.password} hint="Chuyển mật khẩu này cho người dùng qua kênh an toàn."><input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></Field>
          <Field label="Vai trò *" error={err.role}><RoleSelect value={role} onChange={setRole} /></Field>
        </>
      )}
    </FormModal>
  );
}

function RoleModal({ u, onClose, onDone }: { u: AdminUser; onClose: () => void; onDone: () => void }) {
  const { adm, notify } = useAdmin();
  const [role, setRole] = useState(u.role);
  return (
    <FormModal title={`Đổi vai trò: ${u.email}`} onClose={onClose}
      onSubmit={async () => { await adm(`/users/${u.id}`, { method: "PATCH", body: { role } }); notify("Đã đổi vai trò"); onDone(); }}>
      {(err) => (
        <>
          <p className="ad-info">Đổi vai trò sẽ buộc tài khoản này đăng nhập lại. Không thể hạ quyền quản trị viên cuối cùng.</p>
          <Field label="Vai trò" error={err.role}><RoleSelect value={role} onChange={setRole} /></Field>
        </>
      )}
    </FormModal>
  );
}

/** Quản lý tài khoản đăng nhập: tạo, đổi vai trò, khóa / mở khóa (không xóa cứng để giữ lịch sử). */
export default function AccountsPage() {
  const { adm, session } = useAdmin();
  const fl = useListFilters({ q: "", role: "", status: "" });
  const list = useList<AdminUser>("/users", { page: fl.page, pageSize: fl.pageSize, sort: fl.sort ?? "-createdAt", q: fl.applied.q, filters: { role: fl.applied.role, status: fl.applied.status } });
  const [creating, setCreating] = useState(false);
  const [roleOf, setRoleOf] = useState<AdminUser | null>(null);
  const [toggle, setToggle] = useState<AdminUser | null>(null);

  return (
    <>
      <div className="ad-head"><h1>Tài khoản</h1><button className="ad-btn primary" onClick={() => setCreating(true)}>Tạo tài khoản</button></div>
      <FilterBar onApply={fl.apply} onReset={fl.reset}>
        <Field label="Tìm kiếm"><input value={fl.filters.q} onChange={(e) => fl.setField("q", e.target.value)} placeholder="Email..." /></Field>
        <Field label="Vai trò">
          <select value={fl.filters.role} onChange={(e) => fl.applyNow({ role: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(USER_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select value={fl.filters.status} onChange={(e) => fl.applyNow({ status: e.target.value })}>
            <option value="">Tất cả</option>{Object.entries(USER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </FilterBar>
      <ErrorBox error={list.error} onRetry={list.reload} />
      <Loading loading={list.loading && !list.data} empty={!list.loading && !list.error && list.data?.items.length === 0} />
      {list.data && list.data.items.length > 0 && (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><SortHeader label="Email" field="email" sort={fl.sort} onSort={fl.toggleSort} /><th>Vai trò</th><th>Trạng thái</th><SortHeader label="Đăng nhập gần nhất" field="lastLoginAt" sort={fl.sort} onSort={fl.toggleSort} /><SortHeader label="Tạo lúc" field="createdAt" sort={fl.sort} onSort={fl.toggleSort} /><th></th></tr></thead>
            <tbody>
              {list.data.items.map((u) => {
                const self = u.id === session?.user.id;
                return (
                  <tr key={u.id}>
                    <td><b>{u.email}</b>{self && <span className="ad-muted"> (bạn)</span>}</td>
                    <td>{USER_ROLE_LABEL[u.role] ?? u.role}</td>
                    <td><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{USER_STATUS_LABEL[u.status] ?? u.status}</Badge></td>
                    <td>{fmtDateTime(u.lastLoginAt)}</td>
                    <td>{fmtDateTime(u.createdAt)}</td>
                    <td className="actions">
                      {!self && (
                        <div className="ad-row-actions">
                          <button className="ad-btn small" onClick={() => setRoleOf(u)}>Đổi vai trò</button>
                          <button className={`ad-btn small ${u.status === "ACTIVE" ? "danger" : "primary"}`} onClick={() => setToggle(u)}>{u.status === "ACTIVE" ? "Khóa" : "Mở khóa"}</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={fl.setPage} />

      {creating && <CreateModal onClose={() => setCreating(false)} onDone={list.reload} />}
      {roleOf && <RoleModal u={roleOf} onClose={() => setRoleOf(null)} onDone={list.reload} />}
      {toggle && (
        <ConfirmModal title={`${toggle.status === "ACTIVE" ? "Khóa" : "Mở khóa"}: ${toggle.email}`} danger={toggle.status === "ACTIVE"} confirmLabel={toggle.status === "ACTIVE" ? "Khóa" : "Mở khóa"} onClose={() => setToggle(null)}
          message={toggle.status === "ACTIVE" ? "Tài khoản bị khóa không đăng nhập được và mọi phiên hiện có bị thu hồi. Dữ liệu cũ vẫn giữ." : "Tài khoản đăng nhập lại được."}
          onConfirm={async () => { await adm(`/users/${toggle.id}`, { method: "PATCH", body: { status: toggle.status === "ACTIVE" ? "DISABLED" : "ACTIVE" } }); list.reload(); }} />
      )}
    </>
  );
}
