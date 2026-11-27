import { describe, expect, it } from 'vitest';
import { articles, findArticle } from './news';

describe('tin tức', () => {
  it('slug không trùng và đúng dạng đường dẫn', () => {
    const slugs = articles.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('mỗi bài có đủ tiêu đề, ảnh và thân bài', () => {
    for (const a of articles) {
      expect(a.title && a.excerpt && a.image).toBeTruthy();
      expect(a.body.length).toBeGreaterThan(0);
    }
  });

  it('tìm theo slug; slug lạ hoặc thuộc tính có sẵn của object thì không thấy', () => {
    expect(findArticle(articles[0].slug)?.title).toBe(articles[0].title);
    expect(findArticle('khong-co')).toBeUndefined();
    expect(findArticle('constructor')).toBeUndefined();
  });
});
