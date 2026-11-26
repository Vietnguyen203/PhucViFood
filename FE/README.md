# Giao diện web Phúc Vị Foods

React 19 + Vite + Tailwind (xuất từ Figma Make), gọi backend **chỉ qua gateway**. Xem `AGENTS.md` cho quy ước của Figma Make.

## Trang và tính năng

| Đường dẫn | Việc | API (qua gateway) |
|---|---|---|
| `/` | Trang chủ: danh mục, sản phẩm thật (lọc theo danh mục, "Xem thêm"), thêm vào giỏ | `GET /public/categories`, `GET /public/products` |
| (mọi trang) | Giỏ hàng dạng ngăn kéo, lưu trong trình duyệt, đồng bộ giữa các tab | |
| `/thanh-toan` | Thanh toán: thông tin giao hàng, COD hoặc chuyển khoản, mã CTV, đồng ý tư vấn | `POST /public/orders` (có `Idempotency-Key`) |
| `/don-hang/:code?` | Tra cứu đơn bằng mã + SĐT; thông tin chuyển khoản và hạn thanh toán; hủy đơn; xác nhận đã nhận hàng | `GET /public/orders/:code`, `POST .../cancel`, `POST .../confirm-received` |
| `/r/:code?c=kênh` | Link giới thiệu của CTV: ghi nhận lượt bấm, lưu cookie, về trang chủ | `POST /public/referrals/click` |
| `/ctv` | Trang giới thiệu chương trình CTV (nội dung tĩnh; giỏ hàng dùng chung) | |

Khi khách vào qua link CTV, FE gửi cookie kèm đơn hàng (backend quyết định hoa hồng) và ghi nhận sự kiện `ADD_TO_CART`, `CHECKOUT_START` cho thống kê của CTV.

**Chưa làm:** đăng nhập, đăng ký CTV và bảng điều khiển CTV thật (trang `/ctv` vẫn là trang giới thiệu, nút "Đăng nhập", "Đăng ký CTV" còn là neo), giao diện quản trị, trang chi tiết sản phẩm (nên chưa ghi `PRODUCT_VIEW`), tìm kiếm trên header.

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

Đã chạy tay trên trình duyệt với backend thật: xem sản phẩm, thêm giỏ, đặt đơn COD và chuyển khoản, link CTV (ghi nhận lượt bấm, sự kiện, nguồn LINK kèm kênh trong đơn), hủy đơn (hàng về kho), lỗi hết hàng, backend sập (thông báo kèm nút thử lại).

## Cấu trúc

- `src/lib/`: lớp gọi API (`api.ts`), kiểu dữ liệu, giỏ hàng, kiểm tra và dựng dữ liệu thanh toán, link CTV, theo dõi. Có test (`*.test.ts`).
- `src/context/CartContext.tsx`: giỏ hàng toàn ứng dụng.
- `src/components/`: khung chung (header, footer, icon, ngăn kéo giỏ, layout gốc).
- `src/pages/`: các trang. `src/shop.css`: giao diện mua hàng; `src/home.css`, `src/index.css`: giao diện gốc từ Figma Make.

## Ghi chú thiết kế

- **Giá không do FE quyết định:** FE chỉ gửi `productId` và số lượng; backend lấy giá, tên từ catalog và tự tính phí ship. Phí ship hiển thị trước khi đặt là **tạm tính** (đồng giá 30.000đ, miễn phí từ 500.000đ, trong `src/lib/cart.ts`); số chính thức nằm trong đơn.
- **Chống đặt trùng:** mỗi lần thanh toán có một `Idempotency-Key`; giữ nguyên khi lỗi mạng (gửi lại trả đúng đơn cũ), đổi khóa sau lỗi dứt khoát (4xx).
- **Theo dõi không bao giờ làm hỏng việc mua hàng:** mọi lỗi của lượt bấm và sự kiện CTV đều bị nuốt.
- **Số điện thoại** được kiểm tra sớm ở trình duyệt theo đúng quy tắc của backend; backend vẫn kiểm tra lại toàn bộ.
