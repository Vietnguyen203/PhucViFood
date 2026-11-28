# Giao diện web Phúc Vị Foods

React 19 + Vite + Tailwind (xuất từ Figma Make), gọi backend **chỉ qua gateway**. Xem `AGENTS.md` cho quy ước của Figma Make.

## Trang và tính năng

| Đường dẫn | Việc | API (qua gateway) |
|---|---|---|
| `/` | Trang chủ: hàng ô tròn lối tắt dưới banner (ảnh biểu tượng, tên và trang đích do admin đặt, vd bài viết; ẩn khi chưa có ô nào), sản phẩm thật (nút lọc theo danh mục, "Xem thêm"; ẩn khi chưa có sản phẩm), thêm vào giỏ | `GET /public/shortcuts`, `GET /public/categories`, `GET /public/products` |
| `/products/:slug` | Chi tiết sản phẩm: giá, giảm giá, còn/hết hàng, chọn số lượng, thêm vào giỏ hoặc "Mua ngay", sản phẩm cùng danh mục; ghi sự kiện `PRODUCT_VIEW` cho CTV | `GET /public/products/:slug` |
| `/categories/:slug?sort=...&gia=...` | Sản phẩm theo danh mục, sắp xếp, lọc theo khoảng giá, "Xem thêm"; mở từ đường dẫn danh mục ở trang sản phẩm | `GET /public/categories`, `GET /public/products?filter[categoryId]=` |
| `/news`, `/news/:slug` | Danh sách và chi tiết bài viết; nội dung mẫu tĩnh trong `src/lib/news.ts` (chưa có CMS), slug lạ hiện trang "Không tìm thấy" | Không gọi API |
| `/info/:page` | Trang tĩnh: `gioi-thieu`, `lien-he`, `giao-hang`, `doi-tra`, `thanh-toan` (footer trỏ vào đây); khóa lạ và mọi đường dẫn không khớp hiện trang "Không tìm thấy" | Không gọi API |
| `/wishlist` | Sản phẩm đã bấm tim (thẻ sản phẩm, trang chi tiết); lưu trên thiết bị (`pv.wishlist`: chỉ id và slug), tên/giá/tồn kho lấy mới từ catalog, sản phẩm ngừng bán tự bị bỏ | `GET /public/products/:slug` |
| `/cart` | Giỏ hàng đầy đủ: đổi số lượng, xóa, tóm tắt phí ship tạm tính, sang thanh toán (ngăn kéo giỏ có link vào đây) | Chỉ localStorage |
| `/` (banner đầu trang) | Chỉ ảnh, không chữ: khung lớn bên trái (nhiều ảnh tự trượt, dừng khi rê chuột) và tối đa 2 ô khuyến mãi bên phải; bấm vào ra trang đích. Nội dung cài ở admin "Banner trang chủ"; chưa có banner thì dùng ảnh mặc định bấm ra khu sản phẩm | `GET /public/banners` |
| `/` (mục KOL & KOC, dưới banner) | Hàng thẻ chân dung dọc (6 thẻ/hàng màn rộng, vuốt ngang trên điện thoại), nhãn KOL/KOC, tên và câu giới thiệu; bấm ra link đã cài. Chưa có thẻ nào đang bật thì ẩn cả mục | `GET /public/creators` |
| `/` (khung video, dưới KOL/KOC) | Khung rộng: video đang chọn hiện ảnh bìa, bấm mới tải và phát ngay trên trang (YouTube, Vimeo, TikTok, Facebook, tệp .mp4/.webm; link lạ không nhúng được thì mở tab mới); nhiều video thì có hàng ảnh nhỏ để đổi. Thẻ KOL/KOC có link video cũng mở hộp phát video ngay trên trang (link khác vẫn mở như cũ). Chưa có video thì ẩn | `GET /public/videos` |
| `/search?q=...&sort=...&gia=...` | Kết quả tìm kiếm (tên, mô tả), sắp xếp, "Xem thêm"; ô tìm kiếm ở header | `GET /public/products?q=` |
| (mọi trang) | Giỏ hàng dạng ngăn kéo, lưu trong trình duyệt, đồng bộ giữa các tab | |
| `/checkout` | Thanh toán: thông tin giao hàng, COD, chuyển khoản hoặc VNPay (chỉ hiện khi máy chủ bật; chọn VNPay thì chuyển sang cổng thanh toán ngay sau khi đặt), mã CTV, đồng ý tư vấn | `POST /public/orders` (có `Idempotency-Key`) |
| `/checkout/vnpay` | Cổng VNPay đưa khách về sau khi thanh toán: gửi nguyên kết quả cho máy chủ kiểm tra chữ ký rồi báo thành công hoặc hướng dẫn thanh toán lại | `GET /public/payments/vnpay/return` |
| `/orders/:code?` | Tra cứu đơn bằng mã + SĐT; thông tin chuyển khoản, nút "Thanh toán qua VNPay" cho đơn VNPay chưa trả, hạn thanh toán; hủy đơn; xác nhận đã nhận hàng | `GET /public/orders/:code`, `POST .../cancel`, `POST .../confirm-received` |
| `/r/:code?c=kênh` | Link giới thiệu của CTV: ghi nhận lượt bấm, lưu cookie, về trang chủ | `POST /public/referrals/click` |
| `/affiliate` | Trang giới thiệu chương trình CTV (nội dung tĩnh; giỏ hàng dùng chung), nút đăng nhập/đăng ký dẫn vào khu CTV | |
| `/login` | Đăng nhập chung: tự vào đúng khu theo vai trò (ADMIN `/admin`, CTV `/affiliate/account`, khách `/account`); `/login`, `/admin/login` chuyển hướng về đây | `POST /auth/login` |
| `/forgot-password`, `/reset-password?token=` | Quên mật khẩu: nhập email nhận liên kết (luôn báo đã gửi như nhau); trang đặt mật khẩu mới từ liên kết trong thư, xong về đăng nhập | `POST /auth/forgot-password`, `/auth/reset-password` |
| `/register` | Khách mua hàng đăng ký tài khoản (họ tên, email, mật khẩu), đăng nhập luôn | `POST /auth/register-customer` |
| `/affiliate/register` | Đăng ký cộng tác viên | `POST /auth/register` |
| `/account` | Tài khoản của khách: đổi họ tên và mật khẩu, lịch sử đơn (mở rộng xem chi tiết, hướng dẫn chuyển khoản); thanh toán tự điền họ tên, email và gắn đơn với tài khoản (token gửi kèm khi đặt hàng, làm mới trước nếu sắp hết hạn). Phiên lưu ở `pv.customer.session` | `GET /my-orders`, `GET /my-orders/:code`, `PATCH /auth/me` |
| `/affiliate/account/*` | Khu CTV (xem mục dưới) | `/me/*` |

Đường dẫn trang dùng tiếng Anh (`/products`, `/orders`, `/login`, `/admin/orders`, `/affiliate/account`...). Đường dẫn cũ tiếng Việt (`/san-pham`, `/don-hang`, `/ctv/tai-khoan`, `/admin/don-hang`...) vẫn dùng được và tự chuyển sang đường dẫn mới, giữ tham số, `?query` và `#hash`, để link trong thư đã gửi, dấu trang và link do admin đặt ở banner, ô tròn, KOL/KOC không hỏng. Danh sách nằm ở `src/lib/legacyRoutes.ts`.

Khi khách vào qua link CTV, FE gửi cookie kèm đơn hàng (backend quyết định hoa hồng) và ghi nhận sự kiện `ADD_TO_CART`, `CHECKOUT_START` cho thống kê của CTV.

**Chưa làm:** tài khoản khách hàng, yêu thích (nút trái tim chỉ là hình), lọc theo giá, gợi ý khi gõ tìm kiếm.

## Giao diện quản trị (`/admin`)

Chỉ tài khoản ADMIN (đăng nhập ở `/login`; tài khoản dev nằm trong `BE/services/user/prisma/seed.ts`). Không dùng khung cửa hàng, tải theo yêu cầu (lazy) nên khách mua hàng không tải mã quản trị. Mọi lời gọi đi qua gateway kèm access token; hết hạn (401) thì tự làm mới bằng refresh token rồi thử lại một lần (nhiều yêu cầu cùng hết hạn chỉ làm mới một lần); làm mới bị từ chối thì về trang đăng nhập.

| Mục | Việc |
|---|---|
| Báo cáo (`/admin/reports`) | Có cả hoa hồng, đợt chi trả và CTV nổi bật (CSV theo ngày, sản phẩm, CTV). Chọn khoảng ngày (nhanh: hôm nay, 7, 30 ngày, tháng này, tháng trước; tối đa 366 ngày): doanh thu, số đơn, giá trị đơn trung bình, đơn qua CTV, biểu đồ theo ngày, đơn theo trạng thái và hình thức thanh toán, sản phẩm bán chạy; xuất CSV theo ngày và theo sản phẩm |
| Tổng quan (`/admin`) | Doanh thu hôm nay / 7 / 30 ngày và biểu đồ 14 ngày; đơn theo trạng thái; việc cần xử lý (đơn chờ chuyển khoản, chờ CSKH, CTV chờ duyệt, hoa hồng chờ chi, khoản trừ chờ); hàng sắp hết |
| Cấu hình bán hàng | Phí ship và mức miễn phí, hạn giữ hàng chuyển khoản, tài khoản nhận tiền, hạn cookie link CTV; cảnh báo khi chưa cấu hình đủ tài khoản nhận tiền |
| Đơn hàng, chi tiết đơn | Lọc (trạng thái, thanh toán, hình thức, ngày, tìm mã/tên/SĐT); xác nhận, giao, đã giao, hoàn tất, hủy/hoàn (bắt buộc lý do); đánh dấu đã thanh toán/hoàn tiền; ghi nhận CSKH |
| Hàng chờ CSKH | Đơn đã giao chưa hoàn tất, số ngày chờ, lần liên hệ gần nhất |
| Sản phẩm | Thêm, sửa, ẩn/hiện, xóa (danh mục không bắt buộc, không có SKU; giá bán gõ theo nghìn đồng: gõ 339 là 339.000₫, hoặc viết đủ 339.000; thay ô giá gốc bằng ô "Giảm giá (%)" và hệ thống tự tính giá gốc); ảnh tải từ máy (tự thu nhỏ và nén trên trình duyệt, tối đa 1 MB) hoặc dán link; điều chỉnh kho kèm lý do; sổ kho (lịch sử thay đổi); lọc hàng sắp hết |
| Danh mục | Thêm, sửa, ẩn/hiện, xóa |
| Ô tròn trang chủ (`/admin/shortcuts`) | Thêm, sửa, bật/tắt, xóa ô tròn dưới banner: tên, ảnh biểu tượng vuông, trang đích (bài viết, danh mục, link ngoài), thứ tự; khách thấy tối đa 10 ô |
| Chỉnh ảnh (mọi ô ảnh ở admin) | Chọn ảnh từ máy thì mở trình chỉnh ảnh: chọn tỷ lệ khung (gốc, 1:1, 4:3, 3:4, 16:9, 9:16), kéo để căn, phóng to, xoay 90°; "Dùng nguyên ảnh" để bỏ qua. Ảnh đã có có nút "Chỉnh ảnh" (ảnh từ đường dẫn ngoài thường không mở được do trình duyệt chặn) |
| Banner trang chủ (`/admin/banners`) | Thêm, sửa, bật/tắt, xóa banner; chọn vị trí (khung lớn hoặc ô khuyến mãi bên phải), tải ảnh từ máy, đích bấm, thứ tự và lịch hiển thị; thấy trạng thái đang hiện, đã tắt, chưa tới lịch, đã hết hạn |
| KOL / KOC (`/admin/creators`) | Thêm, sửa, bật/tắt, xóa thẻ KOL/KOC; chọn loại, tải ảnh chân dung dọc 3:4, câu giới thiệu, link đích, thứ tự (khách thấy tối đa 12 thẻ) |
| Video trang chủ (`/admin/videos`) | Thêm, sửa, bật/tắt, xóa video (dán link bất kỳ, ảnh bìa tùy chọn, báo link phát được hay chỉ mở tab mới), thứ tự; khách thấy tối đa 6 video |
| Cộng tác viên | Duyệt (hợp đồng, tỷ lệ), từ chối, tạm ngưng, kích hoạt lại, sửa hợp đồng/tỷ lệ |
| Hoa hồng, đợt chi trả, khoản trừ | Xác nhận sớm; tạo đợt chi (chọn hoa hồng, thấy khoản trừ chờ); miễn khoản trừ kèm lý do |
| Khách hàng | Lọc theo phân loại, mức hoạt động, đồng ý tư vấn, tỉnh, ngày; chi tiết, sửa liên hệ, ghi nhận đồng ý; xuất Excel theo đúng bộ lọc |

Mã: `src/lib/admin/` (phiên và tự làm mới `auth.ts`, dựng truy vấn danh sách `query.ts`, tên file tải về `download.ts`, kiểu dữ liệu `types.ts`; có test), `src/admin/` (khung, trang, thành phần dùng chung `ui.tsx`, `admin.css`).

Trang "Tài khoản" (`/admin/accounts`): tạo tài khoản, đổi vai trò, khóa/mở khóa (không xóa cứng). Tỷ lệ hoa hồng mặc định sửa ở "Cấu hình bán hàng". Đổi mật khẩu của chính mình (nút ở thanh bên admin và CTV) và admin đặt lại mật khẩu cho người khác (trang Tài khoản). Chưa làm ở khu quản trị: quên mật khẩu qua email, báo cáo theo khoảng ngày tùy chọn. Màn hình hẹp có menu thu gọn nhưng bảng cuộn ngang.

## Khu cộng tác viên (`/affiliate/account`)

Tài khoản vai trò AFFILIATE (phiên lưu riêng với khu quản trị, khóa `pv.partner.session`; dùng chung khung đăng nhập, làm mới token và giao diện `ad-*` với khu quản trị). Đăng ký chỉ cần email và mật khẩu (8+ ký tự, có chữ và số), sau đó điền hồ sơ (họ tên, SĐT, mã giới thiệu, tài khoản nhận tiền) để Phúc Vị duyệt. Chưa được duyệt (chờ duyệt, từ chối, tạm ngưng) thì chỉ thấy hồ sơ và trạng thái.

| Mục | Việc |
|---|---|
| Tổng quan | Hoa hồng có thể nhận đợt tới, tạm tính, đã chi, khoản trừ chờ; lượt bấm, người truy cập, thêm giỏ, bắt đầu thanh toán theo kênh (7/30/90 ngày) |
| Link giới thiệu | Tạo link theo kênh, sao chép, đổi tên, bật/tắt |
| Hoa hồng | Danh sách theo trạng thái, kèm khoản trừ nếu có |
| Chi trả và khoản trừ | Các đợt đã chi (chi tiết đơn trong đợt), khoản trừ chờ/đã trừ/đã miễn |
| Đơn hàng | Đơn từ link của CTV (tên khách viết tắt, không có SĐT hay địa chỉ) |
| Hồ sơ | Xem hợp đồng, tỷ lệ; sửa họ tên và tài khoản nhận tiền |

Mã: `src/partner/`, `src/lib/partner.ts`, `src/lib/partnerAuth.ts`.

## Chạy

Backend và gateway phải chạy trước (xem `BE/postman/README.md` cách bật 7 service; gateway cổng 3000):

```powershell
pnpm --filter figma-make-app dev        # http://localhost:8443
```

Vite chuyển tiếp `/api/*` tới gateway nên trình duyệt chỉ nói chuyện với cùng một nguồn (không dính CORS):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `GATEWAY_URL` | `http://localhost:3000` | Địa chỉ gateway mà Vite chuyển tiếp tới (dev và preview) |
| `VITE_API_BASE` | `/api` | Địa chỉ API mà mã FE gọi. Đặt thành địa chỉ đầy đủ (vd `https://api.phucvifoods.vn/api`) nếu FE và API khác nguồn; khi đó gateway phải cho phép nguồn FE qua `CORS_ORIGINS` |

Chạy thật: Caddy phục vụ FE (đã build vào image `phucvi-web`) và chuyển `/api/*` vào gateway cùng một nguồn (`BE/infra/Caddyfile`, `BE/infra/docker/web.Dockerfile`, xem `BE/docs/deploy.md`).

## Kiểm thử

```powershell
pnpm --filter figma-make-app typecheck
pnpm --filter figma-make-app test       # test đơn vị lớp thư viện src/lib (Node, không cần trình duyệt)
pnpm --filter figma-make-app build
```

Đã chạy tay trên trình duyệt với backend thật. Khu quản trị: đăng nhập (sai mật khẩu, đúng), trang tổng quan, sửa phí ship ở cấu hình bán hàng, tự làm mới token, xác nhận và hủy đơn (lý do quá ngắn bị chặn), sửa sản phẩm (bỏ giá gốc), ẩn/hiện, xác nhận hoa hồng, tạo đợt chi trả, tải Excel, các màn danh sách. Khu CTV: đăng ký (mật khẩu yếu, không khớp bị chặn), mã giới thiệu sai, gửi hồ sơ, admin duyệt, tạo link, đăng nhập CTV seed và các trang tổng quan, link, hoa hồng, chi trả, đơn hàng. Cửa hàng: xem sản phẩm, thêm giỏ, đặt đơn COD và chuyển khoản, link CTV (ghi nhận lượt bấm, sự kiện, nguồn LINK kèm kênh trong đơn), hủy đơn (hàng về kho), lỗi hết hàng, trang chi tiết (sự kiện `PRODUCT_VIEW` ghi vào tracking khi vào qua link CTV, slug không có), tìm kiếm (từ khóa thừa khoảng trắng, sắp xếp, không kết quả), "Mua ngay", backend sập (thông báo kèm nút thử lại).

## Cấu trúc

- `src/admin/`: giao diện quản trị; `src/partner/`: khu cộng tác viên (xem các mục trên).
- `src/lib/`: lớp gọi API (`api.ts`), kiểu dữ liệu, giỏ hàng, kiểm tra và dựng dữ liệu thanh toán, link CTV, theo dõi. Có test (`*.test.ts`).
- `src/context/CartContext.tsx`: giỏ hàng toàn ứng dụng.
- `src/components/`: khung chung (header, footer, icon, ngăn kéo giỏ, layout gốc).
- `src/pages/`: các trang. `src/shop.css`: giao diện mua hàng; `src/home.css`, `src/index.css`: giao diện gốc từ Figma Make.

## Ghi chú thiết kế

- **Giá không do FE quyết định:** FE chỉ gửi `productId` và số lượng; backend lấy giá, tên từ catalog và tự tính phí ship. Phí ship hiển thị trước khi đặt là **tạm tính** (đồng giá 30.000đ, miễn phí từ 500.000đ, trong `src/lib/cart.ts`); số chính thức nằm trong đơn.
- **Chống đặt trùng:** mỗi lần thanh toán có một `Idempotency-Key`; giữ nguyên khi lỗi mạng (gửi lại trả đúng đơn cũ), đổi khóa sau lỗi dứt khoát (4xx).
- **Theo dõi không bao giờ làm hỏng việc mua hàng:** mọi lỗi của lượt bấm và sự kiện CTV đều bị nuốt.
- **Số điện thoại** được kiểm tra sớm ở trình duyệt theo đúng quy tắc của backend; backend vẫn kiểm tra lại toàn bộ.

## Giao diện điện thoại và tiếp cận
- Bảng admin và CTV tự thành thẻ ở màn dưới 600px: `useTableLabels` (`src/admin/ui.tsx`) gắn `data-label` từ tiêu đề cột cho mọi `table.ad-table`, CSS ở cuối `admin/admin.css`.
- Ô tìm kiếm ở header có gợi ý khi gõ (`components/SearchBox.tsx`, mẫu combobox/listbox: mũi tên, Enter, Esc).
- Có liên kết "Bỏ qua tới nội dung chính", viền focus rõ, ô nhập 16px trên điện thoại. Màu chữ phụ đã chỉnh để đạt tỷ lệ tương phản 4,5:1 (kiểm tra tự động ở cửa hàng, admin; phần hình điện thoại minh họa ở `/affiliate` giữ nguyên).
- Tổng quan CTV có biểu đồ hoa hồng phát sinh theo ngày (7/30/90 ngày).

