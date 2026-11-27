/** Bài viết tin tức: nội dung mẫu tĩnh (chưa có CMS). Mỗi khối thân bài là đoạn văn, tiêu đề phụ hoặc danh sách. */
export type NewsBlock = { type: 'p'; text: string } | { type: 'h2'; text: string } | { type: 'ul'; items: string[] };

export interface Article {
  slug: string;
  category: string;
  /** Hiển thị dạng dd.mm.yyyy. */
  date: string;
  title: string;
  excerpt: string;
  image: string;
  body: NewsBlock[];
}

export const articles: Article[] = [
  {
    slug: 'huong-vi-viet-trong-bua-com-sum-vay',
    category: 'Chuyện ẩm thực',
    date: '18.05.2025',
    title: 'Hương vị Việt trong từng bữa cơm sum vầy',
    excerpt: 'Có những món ăn không chỉ ngon mà còn lưu giữ ký ức về gia đình và quê hương.',
    image: 'https://images.unsplash.com/photo-1516211697506-8360dbcfe9a4?auto=format&fit=crop&w=1400&q=88',
    body: [
      { type: 'p', text: 'Mỗi gia đình Việt đều có một món ăn gắn với ký ức: nồi cá kho ngày giáp Tết, đĩa khô mằn mặn bên mâm cơm chiều, hay chai nước chấm bà tự pha. Hương vị ấy không chỉ làm no bụng mà còn kéo mọi người ngồi lại gần nhau.' },
      { type: 'h2', text: 'Món ngon đến từ sự chậm rãi' },
      { type: 'p', text: 'Phần lớn đặc sản vùng miền được làm theo cách truyền thống: phơi nắng, ướp gia vị, chờ đủ thời gian để vị ngấm đều. Chính sự chậm rãi đó tạo nên hương vị mà đồ ăn làm vội khó có được.' },
      { type: 'h2', text: 'Giữ bữa cơm gia đình' },
      { type: 'ul', items: ['Chọn một ngày trong tuần để cả nhà cùng nấu và cùng ăn.', 'Thêm một món đặc sản quê nhà vào mâm cơm quen thuộc.', 'Kể cho con cháu nghe món ăn ấy đến từ đâu.'] },
      { type: 'p', text: 'Phúc Vị mong được góp một phần nhỏ vào những bữa cơm như thế: mang đặc sản đến gần hơn với mỗi gia đình, dù bạn ở xa quê đến đâu.' },
    ],
  },
  {
    slug: '5-cach-bien-tau-lap-xuong',
    category: 'Bí quyết vào bếp',
    date: '12.05.2025',
    title: '5 cách biến tấu lạp xưởng cho bữa cơm nhà',
    excerpt: 'Những công thức nhanh gọn giúp món lạp xưởng quen thuộc trở nên hấp dẫn hơn mỗi ngày.',
    image: 'https://images.unsplash.com/photo-1511910849309-0dffb8785146?auto=format&fit=crop&w=1400&q=88',
    body: [
      { type: 'p', text: 'Lạp xưởng là nguyên liệu dễ nấu và hợp với nhiều món. Dưới đây là năm cách đơn giản để bữa cơm nhà bớt nhàm chán.' },
      { type: 'ul', items: ['Cơm chiên lạp xưởng: thái hạt lựu, chiên cho ra mỡ rồi xào cùng cơm nguội và hành lá.', 'Xôi lạp xưởng: xôi nếp dẻo, lạp xưởng chiên vàng, thêm hành phi và chút dưa leo.', 'Bánh mì nướng lạp xưởng: thái lát mỏng, nướng giòn và kẹp cùng rau thơm.', 'Canh bí đao hoặc canh rau nấu với vài lát lạp xưởng để nước ngọt đậm hơn.', 'Trứng chiên lạp xưởng: món sáng nhanh gọn, ăn kèm cơm nóng.'] },
      { type: 'h2', text: 'Mẹo nhỏ' },
      { type: 'p', text: 'Hấp hoặc chiên với lửa nhỏ để lạp xưởng chín đều, không bị cháy ngoài sống trong. Có thể chần qua nước sôi một lúc nếu muốn bớt béo.' },
    ],
  },
  {
    slug: 'cach-chon-dac-san-lam-qua-tang',
    category: 'Cẩm nang sản phẩm',
    date: '06.05.2025',
    title: 'Cách chọn đặc sản ngon để làm quà tặng',
    excerpt: 'Một món quà đúng vị là cách chân thành để gửi lời cảm ơn đến người bạn trân quý.',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1400&q=88',
    body: [
      { type: 'p', text: 'Đặc sản là món quà được nhiều người chọn vì vừa mang hương vị quê nhà vừa thể hiện sự quan tâm. Để chọn đúng món, bạn có thể tham khảo vài gợi ý sau.' },
      { type: 'h2', text: 'Nghĩ về người nhận' },
      { type: 'ul', items: ['Người thích nấu ăn: nguyên liệu như khô, gia vị, nước chấm.', 'Người bận rộn: món ăn liền, dùng được ngay.', 'Người lớn tuổi: món quen vị, ít cay, dễ bảo quản.'] },
      { type: 'h2', text: 'Kiểm tra trước khi mua' },
      { type: 'ul', items: ['Quy cách đóng gói và khối lượng ghi rõ trên sản phẩm.', 'Hạn sử dụng còn đủ dài để người nhận kịp dùng.', 'Cách bảo quản: nơi khô ráo, tránh ánh nắng, hoặc ngăn mát tủ lạnh.'] },
      { type: 'p', text: 'Nếu cần gói quà theo dịp đặc biệt, bạn có thể liên hệ Phúc Vị để được tư vấn.' },
    ],
  },
];

export const findArticle = (slug: string): Article | undefined => articles.find((a) => a.slug === slug);
