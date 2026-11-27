import { Link, useParams } from "react-router";
import { HomeFooter } from "../components/SiteFooter";
import { HomeHeader } from "../components/SiteHeader";
import { HomeIcon } from "../components/Icon";
import { articles, findArticle } from "../lib/news";
import { useDocumentTitle } from "../lib/pageTitle";
import { NotFoundPage } from "./InfoPages";
import "../home.css";

/** Danh sách bài viết: /tin-tuc */
export function NewsListPage() {
  useDocumentTitle("Tin tức");
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page">
        <h1 className="shop-title">Tin tức & câu chuyện món ngon</h1>
        <div className="home-article-grid">
          {articles.map((a) => (
            <article className="home-article-card" key={a.slug}>
              <Link to={`/tin-tuc/${a.slug}`} className="home-article-image">
                <img src={a.image} alt={a.title} />
                <span>Đọc bài viết</span>
              </Link>
              <div className="home-article-meta"><span>{a.category}</span><i /><time>{a.date}</time></div>
              <h3>{a.title}</h3>
              <p>{a.excerpt}</p>
              <Link to={`/tin-tuc/${a.slug}`}>Xem chi tiết <HomeIcon name="arrow" size={15} /></Link>
            </article>
          ))}
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}

/** Chi tiết bài viết: /tin-tuc/:slug */
export function NewsDetailPage() {
  const { slug = "" } = useParams();
  const article = findArticle(slug);
  useDocumentTitle(article?.title);
  if (!article) return <NotFoundPage />;
  const others = articles.filter((a) => a.slug !== article.slug);
  return (
    <div className="home-page">
      <HomeHeader />
      <main className="shop-page shop-article">
        <p className="shop-muted"><Link to="/">Trang chủ</Link> / <Link to="/tin-tuc">Tin tức</Link> / <span>{article.title}</span></p>
        <div className="home-article-meta"><span>{article.category}</span><i /><time>{article.date}</time></div>
        <h1 className="shop-title">{article.title}</h1>
        <img className="shop-article-cover" src={article.image} alt={article.title} />
        <div className="shop-article-body">
          {article.body.map((b, i) =>
            b.type === "h2" ? <h2 key={i}>{b.text}</h2>
            : b.type === "ul" ? <ul key={i}>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
            : <p key={i}>{b.text}</p>,
          )}
        </div>
        <div className="shop-article-cta">
          <Link className="shop-btn primary" to="/#best-sellers">Xem sản phẩm của Phúc Vị</Link>
        </div>
        <h2 className="shop-article-more">Bài viết khác</h2>
        <ul className="shop-article-list">
          {others.map((a) => <li key={a.slug}><Link to={`/tin-tuc/${a.slug}`}>{a.title}</Link> <span className="shop-muted">· {a.date}</span></li>)}
        </ul>
      </main>
      <HomeFooter />
    </div>
  );
}
