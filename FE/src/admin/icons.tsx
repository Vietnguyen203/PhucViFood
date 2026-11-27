import type { ReactNode } from "react";

/** Bộ icon nét mảnh cho khu quản trị (cùng kiểu với icon cửa hàng). */
const PATHS: Record<string, ReactNode> = {
  edit: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14 7 3 3" /></>,
  stock: <><path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" /><path d="M12 12v9M3 8l9 4 9-4" /></>,
  ledger: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.7 6.7C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3M14 9l2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  userCog: <><circle cx="9" cy="8" r="4" /><path d="M2 20c.6-3.6 3.4-6 7-6 1.2 0 2.3.3 3.3.7" /><circle cx="18" cy="17" r="2.2" /><path d="M18 12.8v1.1M18 20.1v1.1M14.4 15l1 .6M20.6 18.4l1 .6M14.4 19l1-.6M20.6 15.6l1-.6" /></>,
};

export type AdIconName = keyof typeof PATHS;

export function AdIcon({ name, size = 18 }: { name: AdIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/** Nút hành động dạng icon: nhãn hiện khi rê chuột (title) và cho trình đọc màn hình (aria-label). */
export function IconButton({ icon, label, onClick, disabled, tone }: { icon: AdIconName; label: string; onClick: () => void; disabled?: boolean; tone?: "danger" | "primary" }) {
  return (
    <button type="button" className={`ad-icon-btn${tone ? ` ${tone}` : ""}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <AdIcon name={icon} />
    </button>
  );
}
