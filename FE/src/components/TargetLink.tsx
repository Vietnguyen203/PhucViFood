import type { ReactNode } from "react";
import { Link } from "react-router";
import { bannerTarget } from "../lib/banner";

/** Liên kết theo đích đã cài: trang trong cửa hàng, link ngoài (mở tab mới), hoặc không bấm được (chỉ là khung). */
export function TargetLink({ to, label, className, children }: { to: string | null | undefined; label: string; className?: string; children: ReactNode }) {
  const t = bannerTarget(to);
  if (t.kind === "internal") return <Link className={className} to={t.to} aria-label={label}>{children}</Link>;
  if (t.kind === "external") return <a className={className} href={t.href} target="_blank" rel="noopener noreferrer" aria-label={label}>{children}</a>;
  return <div className={className} role="group" aria-label={label}>{children}</div>;
}
