import { Link } from "react-router";
import { fetchCategories } from "../lib/catalog";
import { useAsync } from "../lib/useAsync";

/** Số danh mục tối đa ở hàng hình tròn. */
const MAX_CIRCLES = 10;

/**
 * Hàng lối tắt danh mục hình tròn dưới banner: ảnh đại diện (admin tải ở trang Danh mục) và tên; chưa có ảnh thì hiện chữ cái đầu.
 * Bấm vào ra trang danh mục. Chưa có danh mục nào (hoặc lỗi tải) thì ẩn cả hàng.
 */
export function CategoryCircles() {
  const { data } = useAsync((signal) => fetchCategories(signal), []);
  if (!data || data.length === 0) return null;
  return (
    <nav className="home-circles" id="categories" aria-label="Danh mục sản phẩm">
      <ul>
        {data.slice(0, MAX_CIRCLES).map((c) => (
          <li key={c.id}>
            <Link to={`/danh-muc/${encodeURIComponent(c.slug)}`}>
              <span className="home-circle">
                {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : <b aria-hidden="true">{[...c.name.trim()][0]?.toUpperCase()}</b>}
              </span>
              <span className="home-circle-name">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
