import { generatePath, Navigate, useLocation, useParams } from "react-router";
import { LEGACY_INFO_PAGES } from "../lib/legacyRoutes";

/** Đường dẫn cũ (tiếng Việt) chuyển sang đường dẫn mới, giữ tham số, ?query và #hash. */
export function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`${generatePath(to, params)}${search}${hash}`} replace />;
}

/** /thong-tin/:page cũ: đổi khóa trang sang tiếng Anh (khóa lạ giữ nguyên để hiện trang không tìm thấy). */
export function LegacyInfoRedirect() {
  const { page = "" } = useParams();
  const { search, hash } = useLocation();
  const key = Object.prototype.hasOwnProperty.call(LEGACY_INFO_PAGES, page) ? LEGACY_INFO_PAGES[page] : page;
  return <Navigate to={`/info/${encodeURIComponent(key)}${search}${hash}`} replace />;
}
