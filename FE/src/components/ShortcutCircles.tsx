import { fetchShortcuts } from "../lib/shortcut";
import { useAsync } from "../lib/useAsync";
import { TargetLink } from "./TargetLink";

/**
 * Hàng ô tròn lối tắt dưới banner: ảnh biểu tượng và tên do admin đặt (ví dụ đẩy sang bài viết), bấm vào ra trang đích đã cài.
 * Chưa có ô nào đang bật (hoặc lỗi tải) thì ẩn cả hàng.
 */
export function ShortcutCircles() {
  const { data } = useAsync((signal) => fetchShortcuts(signal), []);
  if (!data || data.length === 0) return null;
  return (
    <nav className="home-circles" aria-label="Lối tắt">
      <ul>
        {data.map((c) => (
          <li key={c.id}>
            <TargetLink to={c.linkUrl} label={c.title} className="home-circle-link">
              <span className="home-circle"><img src={c.imageUrl} alt="" loading="lazy" /></span>
              <span className="home-circle-name">{c.title}</span>
            </TargetLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
