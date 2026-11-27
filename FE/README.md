# Giao diện web Phúc Vị Foods

React 19 + Vite + Tailwind (xuất từ Figma Make), gọi backend **chỉ qua gateway**. Xem `AGENTS.md` cho quy ước của Figma Make.

## Trang và tính năng

| Đường dẫn | Việc | API (qua gateway) |
|---|---|---|
| `/` | Trang chủ: danh mục, sản phẩm thật (lọc theo danh mục, "Xem thêm"), thêm vào giỏ | `GET /public/categories`, `GET /public/products` |
| `/san-pham/:slug` | Chi tiết sản phẩm: giá, giảm giá, còn/hết hàng, chọn số lượng, thêm vào giỏ hoặc "Mua ngay", sản phẩm cùng danh mục; ghi sự kiện `PRODUCT_VIEW` cho CTV | `GET /public/products/:slug` |
| `/danh-muc/:slug?sort=...` | Sản phẩm theo danh mục, sắp xếp, "Xem thêm"; mở từ đường dẫn danh mục ở trang sản phẩm | `GET /public/categories`, `GET /public/products?filter[categoryId]=` |
| `/thong-tin/:page` | Trang tĩnh: `gioi-thieu`, `lien-he`, `giao-hang`, `doi-tra`, `thanh-toan` (footer trỏ vào đây); khóa lạ và mọi đường dẫn không khớp hiện trang "Không tìm thấy" | Không gọi API |
| `/gio-hang` | Giỏ hàng đầy đủ: đổi số lượng, xóa, tóm tắt phí ship tạm tính, sang thanh toán (ngăn kéo giỏ có link vào đây) | Chỉ localStorage |
| `/tim-kiem?q=...&sort=...` | Kết quả tìm kiếm (tên, mô tả), sắp xếp, "Xem thêm"; ô tìm kiếm ở header | `GET /public/products?q=` |
| (mọi trang) | Giỏ hàng dạng ngăn kéo, lưu trong trình duyệt, đồng bộ giữa các tab | |
| `/thanh-toan` | Thanh toán: thông tin giao hàng, COD hoặc chuyển khoản, mã CTV, đồng ý tư vấn | `POST /public/orders` (có `Idempotency-Key`) |
| `/don-hang/:code?` | Tra cứu đơn bằng mã + SĐT; thông tin chuyển khoản và hạn thanh toán; hủy đơn; xác nhận đã nhận hàng | `GET /public/orders/:code`, `POST .../cancel`, `POST .../confirm-received` |
| `/r/:code?c=kênh` | Link giới thiệu của CTV: ghi nhận lượt bấm, lưu cookie, về trang chủ | `POST /public/referrals/click` |
| `/ctv` | Trang giới thiệu chương trình CTV (nội dung tĩnh; giỏ hàng dùng chung), nút đăng nhập/đăng ký dẫn vào khu CTV | |
| `/ctv/dang-ky`, `/ctv/dang-nhap` | Đăng ký, đăng nhập cộng tác viên | `POST /auth/register`, `/auth/login` |
| `/ctv/tai-khoan/*` | Khu CTV (xem mục dưới) | `/me/*` |

Khi khách vào qua link CTV, FE gửi cookie kèm đơn hàng (backend quyết định hoa hồng) và ghi nhận sự kiện `ADD_TO_CART`, `CHECKOUT_START` cho thống kê của CTV.

**Chưa làm:** tài khoản khách hàng, yêu thích (nút trái tim chỉ là hình), lọc theo giá, gợi ý khi gõ tìm kiếm.

## Giao diện quản trị (`/admin`)

Chỉ tài khoản ADMIN (đăng nhập `/admin/login`; tài khoản dev nằm trong `BE/services/user/prisma/seed.ts`). Không dùng khung cửa hàng, tải theo yêu cầu (lazy) nên khách mua hàng không tải mã quản trị. Mọi lời gọi đi qua gateway kèm access token; hết hạn (401) thì tự làm mới bằng refresh token rồi thử lại một lần (nhiều yêu cầu cùng hết hạn chỉ làm mới một lần); làm mới bị từ chối thì về trang đăng nhập.

| Mục | Việc |
|---|---|
| Tổng quan (`/admin`) | Doanh thu hôm nay / 7 / 30 ngày và biểu đồ 14 ngày; đơn theo trạng thái; việc cần xử lý (đơn chờ chuyển khoản, chờ CSKH, CTV chờ duyệt, hoa hồng chờ chi, khoản trừ chờ); hàng sắp hết |
| Cấu hình bán hàng | Phí ship và mức miễn phí, hạn giữ hàng chuyển khoản, tài khoản nhận tiền, hạn cookie link CTV; cảnh báo khi chưa cấu hình đủ tài khoản nhận tiền |
| Đơn hàng, chi tiết đơn | Lọc (trạng thái, thanh toán, hình thức, ngày, tìm mã/tên/SĐT); xác nhận, giao, đã giao, hoàn tất, hủy/hoàn (bắt buộc lý do); đánh dấu đã thanh toán/hoàn tiền; ghi nhận CSKH |
| Hàng chờ CSKH | Đơn đã giao chưa hoàn tất, số ngày chờ, lần liên hệ gần nhất |
| Sản phẩm và tồn kho | Thêm, sửa, ẩn/hiện, xóa; điều chỉnh kho kèm lý do; sổ kho (lịch sử thay đổi); lọc hàng sắp hết |
| Danh mục | Thêm, sửa, ẩn/hiện, xóa |
| Cộng tác viên | Duyệt (hợp đồng, tỷ lệ), từ chối, tạm ngưng, kích hoạt lại, sửa hợp đồng/tỷ lệ |
| Hoa hồng, đợt chi trả, khoản trừ | Xác nhận sớm; tạo đợt chi (chọn hoa hồng, thấy khoản trừ chờ); miễn khoản trừ kèm lý do |
| Khách hàng | Lọc theo phân loại, mức hoạt động, đồng ý tư vấn, tỉnh, ngày; chi tiết, sửa liên hệ, ghi nhận đồng ý; xuất Excel theo đúng bộ lọc |
| Cài đặt và nhật ký xuất | Ngưỡng phân loại khách; nhật ký các lần xuất dữ liệu |

Mã: `src/lib/admin/` (phiên và tự làm mới `auth.ts`, dựng truy vấn danh sách `query.ts`, tên file tải về `download.ts`, kiểu dữ liệu `types.ts`; có test), `src/admin/` (khung, trang, thành phần dùng chung `ui.tsx`, `admin.css`).

Trang "Tài khoản" (`/admin/tai-khoan`): tạo tài khoản, đổi vai trò, khóa/mở khóa (không xóa cứng). Tỷ lệ hoa hồng mặc định sửa ở "Cấu hình bán hàng". Chưa làm ở khu quản trị: đổi mật khẩu/đặt lại mật khẩu cho người khác, báo cáo theo khoảng ngày tùy chọn. Màn hình hẹp có menu thu gọn nhưng bảng cuộn ngang.

## Khu cộng tác viên (`/ctv/tai-khoan`)

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

Chạy thật: Caddy chuyển `/api/*` vào gateway (`BE/infra/Caddyfile`); FE cần được phục vụ cùng nguồn đó (Caddy chưa phục vụ FE, xem `BE/docs/deploy.md`).

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
