// Đường dẫn trang cũ (tiếng Việt) và nơi chúng chuyển tới. Giữ để link đã gửi trong thư, dấu trang, banner và ô tròn do admin đặt trước đây vẫn dùng được.
// Tham số (:slug, :code, :id) và phần ?query, #hash được giữ nguyên khi chuyển.

/** [đường dẫn cũ, đường dẫn mới]; tham số ở đường dẫn mới phải có trong đường dẫn cũ. */
export const LEGACY_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  // Cửa hàng
  ['/san-pham/:slug', '/products/:slug'], ['/tim-kiem', '/search'], ['/danh-muc/:slug', '/categories/:slug'], ['/gio-hang', '/cart'],
  ['/yeu-thich', '/wishlist'], ['/tin-tuc', '/news'], ['/tin-tuc/:slug', '/news/:slug'], ['/dang-nhap', '/login'], ['/dang-ky', '/register'],
  ['/quen-mat-khau', '/forgot-password'], ['/dat-lai-mat-khau', '/reset-password'], ['/tai-khoan', '/account'],
  ['/thanh-toan', '/checkout'], ['/thanh-toan/vnpay', '/checkout/vnpay'], ['/don-hang/:code?', '/orders/:code?'],
  // Cộng tác viên
  ['/ctv', '/affiliate'], ['/ctv/dang-nhap', '/login'], ['/ctv/dang-ky', '/affiliate/register'], ['/ctv/tai-khoan', '/affiliate/account'],
  ['/ctv/tai-khoan/link', '/affiliate/account/links'], ['/ctv/tai-khoan/hoa-hong', '/affiliate/account/commissions'],
  ['/ctv/tai-khoan/chi-tra', '/affiliate/account/payouts'], ['/ctv/tai-khoan/don-hang', '/affiliate/account/orders'], ['/ctv/tai-khoan/ho-so', '/affiliate/account/profile'],
  // Quản trị
  ['/admin/bao-cao', '/admin/reports'], ['/admin/cai-dat-cua-hang', '/admin/settings'], ['/admin/don-hang', '/admin/orders'], ['/admin/don-hang/:id', '/admin/orders/:id'],
  ['/admin/cskh', '/admin/care-queue'], ['/admin/ctv', '/admin/affiliates'], ['/admin/hoa-hong', '/admin/commissions'], ['/admin/chi-tra', '/admin/payouts'],
  ['/admin/khoan-tru', '/admin/adjustments'], ['/admin/khach-hang', '/admin/customers'], ['/admin/khach-hang/:id', '/admin/customers/:id'],
  ['/admin/tai-khoan', '/admin/accounts'], ['/admin/banner', '/admin/banners'], ['/admin/kol-koc', '/admin/creators'], ['/admin/video', '/admin/videos'],
  ['/admin/o-tron', '/admin/shortcuts'], ['/admin/san-pham', '/admin/products'], ['/admin/danh-muc', '/admin/categories'],
];

/** Trang thông tin: khóa cũ (tiếng Việt) sang khóa mới. */
export const LEGACY_INFO_PAGES: Readonly<Record<string, string>> = {
  'gioi-thieu': 'about', 'lien-he': 'contact', 'giao-hang': 'shipping', 'doi-tra': 'returns', 'thanh-toan': 'payment',
};
