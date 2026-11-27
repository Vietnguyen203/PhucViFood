# Service catalog (danh mục, sản phẩm, tồn kho)

Thư mục: `BE/services/catalog` (gói `@phucvi/catalog`). Database `catalog_db`, schema `catalog`. Cổng mặc định 3003.

## 1. API

Tiền tố `/api`. JWT do service `user` ký bằng khóa riêng; service này chỉ có khóa công khai (`JWT_PUBLIC_KEY`) để kiểm tra.

**Công khai (web bán hàng, không cần đăng nhập)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/public/categories` | Danh mục đang bật, theo `sortOrder` |
| GET | `/public/products` | Sản phẩm đang bán: phân trang, `q`, `sort` (createdAt, name, price), `filter[categoryId]`, `filter[price][gte/lte]` |
| GET | `/public/products/:slug` | Chi tiết theo slug |

Khách chỉ thấy sản phẩm đang hiển thị, chưa xóa, thuộc danh mục đang bật. Chỉ có `inStock` (còn hàng hay không), **không lộ số tồn kho**.

**ADMIN**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET, POST, PATCH, DELETE | `/categories`, `/categories/:id` | Danh mục. Slug tự sinh từ tên (không dấu). Xóa là xóa mềm (`deleted_at`), chỉ khi không còn sản phẩm đang tồn tại (sản phẩm đã xóa mềm không tính; còn sản phẩm thì báo số lượng, hoặc tắt bằng `isActive=false`). Danh mục đã xóa không gán thêm cho sản phẩm được |
| GET | `/public/banners` | Công khai. Banner trang chủ đang hiển thị (bật và trong khoảng lịch): `{ main: [...], side: [...] }`, mỗi phần tử `{ id, title, imageUrl, linkUrl }`, xếp theo `sortOrder` rồi ngày tạo |
| GET, POST, PATCH, DELETE | `/banners`, `/banners/:id` | ADMIN. Quản lý banner: `title`, `imageUrl` (link http(s) hoặc ảnh đã tải lên), `linkUrl` (trang trong cửa hàng bắt đầu bằng một dấu `/` hoặc link http(s); bỏ trống hoặc `null` = chỉ là ảnh), `slot` (`MAIN` khung lớn trượt nhiều ảnh, `SIDE` ô khuyến mãi bên phải), `sortOrder`, `isActive`, `startsAt`/`endsAt` (lịch hiển thị, `endsAt` phải sau `startsAt`). Lọc `slot`, `isActive`. Xóa là xóa hẳn |
| POST | `/products/images` | ADMIN. Tải ảnh sản phẩm: thân yêu cầu là ảnh thô, `Content-Type` là `image/png`, `image/jpeg` hoặc `image/webp`, tối đa 1 MiB (bằng giới hạn gateway và Caddy). Loại ảnh được kiểm tra theo byte đầu của tệp (khai sai loại hoặc giả ảnh trả 400); tên tệp do hệ thống sinh (UUID). Lưu ở `UPLOAD_DIR` (mặc định `./uploads`; Docker: volume `phucvi-uploads` gắn vào `/data/uploads`). Trả `{ url, size, contentType }` với `url` dạng `/api/public/uploads/<uuid>.<đuôi>` |
| GET | `/public/uploads/:name` | Công khai. Phục vụ ảnh đã tải lên (`Cache-Control` immutable, `nosniff`); tên không đúng dạng hoặc không có tệp thì 404 |
| GET, POST, PATCH, DELETE | `/products`, `/products/:id` | Sản phẩm. `imageUrl` là link http(s) hoặc đường dẫn ảnh đã tải lên (gửi `null` khi sửa để gỡ ảnh). Danh mục không bắt buộc (`categoryId` bỏ trống hoặc `null` = không thuộc danh mục nào; sửa `null` để bỏ khỏi danh mục; sản phẩm không danh mục vẫn hiện và bán bình thường). Xóa là xóa mềm (đơn cũ vẫn tham chiếu). Thấy cả hàng ẩn và tồn kho chính xác |
| POST | `/products/:id/stock-adjustments` | Điều chỉnh tồn kho `{delta, note}`; `note` bắt buộc; không cho âm |
| GET | `/products/:id/stock-movements` | Sổ cái tồn kho của sản phẩm |

**Nội bộ (header `x-internal-key`)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/internal/stock/reserve` | Ordering giữ hàng cho một đơn: trừ tồn, trả snapshot sản phẩm |
| POST | `/internal/stock/release` | Trả hàng (bồi hoàn khi tạo đơn thất bại). Idempotent |

## 2. Quy tắc tồn kho

- **Không bán quá tồn kho.** Giữ hàng trừ tồn ngay khi đặt, kiểm tra nằm trong chính câu `UPDATE` nên các đơn song song không thể cùng lấy phần tồn cuối. Đã kiểm chứng: 12 đơn song song cho 3 sản phẩm tồn kho thì đúng 3 đơn thành công, tồn về 0 và không âm.
- **Tất cả hoặc không gì cả:** thiếu một sản phẩm thì không sản phẩm nào bị trừ (409 kèm số còn lại của từng sản phẩm).
- **Idempotent theo đơn:** gọi `reserve` lại cùng `orderId` trả bản phát lại (`replayed: true`), không trừ thêm; nội dung khác thì 409. `release` cũng vậy. Bảo đảm bằng unique index `(order_id, product_id, reason)` nên đúng cả khi gọi song song.
- **Sổ cái `stock_movements`:** mọi thay đổi tồn kho đều có một dòng (`ORDER_PLACED` âm, `ORDER_CANCELLED` dương, `ADMIN_ADJUSTMENT`), tồn đầu kỳ khi tạo sản phẩm cũng được ghi. Tồn kho không sửa được qua `PATCH /products/:id`.
- **Đơn bị HỦY** (sự kiện `ordering.order.status_changed`) tự trả hàng. Đơn bị **TRẢ** (RETURNED) không tự nhập lại kho vì hàng trả phải kiểm tra; admin điều chỉnh tay.

## 3. Tích hợp với ordering

Khi đặt hàng, ordering làm theo thứ tự:
1. Sinh `orderId`.
2. `POST /internal/stock/reserve` với `{orderId, items:[{productId, quantity}]}`. Nhận về tên, SKU, quy cách, `unitPrice`, `lineTotal` và `subtotal` để lưu snapshot vào đơn (không cần hỏi giá ở chỗ khác).
3. Tạo đơn trong database của ordering. Nếu bước này lỗi, gọi `POST /internal/stock/release` với cùng `orderId` để trả hàng.

Lỗi của bước 2: `409` thiếu tồn kho (`details: [{productId, requested, available}]`); `422` có sản phẩm không còn bán (`details: [{productId, reason}]`).

Giá trong snapshot là giá **tại lúc giữ hàng**. Nếu phát lại (`replayed`), giá trả về là giá hiện tại, vì vậy ordering nên lưu kết quả lần gọi đầu.

## 4. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `CATALOG_DATABASE_URL`, `RABBITMQ_URL` | bắt buộc | |
| `JWT_PUBLIC_KEY` | bắt buộc | Khóa công khai RSA (PEM hoặc base64) của cặp khóa do `pnpm jwt:keygen` sinh; service này chỉ kiểm tra token |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Khóa gọi API nội bộ |
| `PORT` | 3003 | |
| `CATALOG_EVENT_QUEUE` | `catalog.stock` | |
| `OUTBOX_RELAY_ENABLED` | `true` | |

## 4b. Dọn hàng giữ cho đơn không tồn tại

Ordering giữ hàng ở catalog **trước** khi tạo đơn. Nếu ordering sập (hoặc việc trả hàng bồi hoàn thất bại) đúng giữa hai bước đó thì hàng bị trừ mà không có đơn nào để hủy hay trả. Job `OrphanReservationsService` xử lý phần hàng bị sót này:

1. Mỗi `ORPHAN_SWEEP_INTERVAL_MS` (mặc định 5 phút) lấy các lần giữ hàng **chưa được trả**, cũ hơn `ORPHAN_MIN_AGE_MINUTES` (mặc định 10 phút, đủ chắc chắn ordering đã tạo xong đơn nếu có) và trong `ORPHAN_LOOKBACK_HOURS` (mặc định 24 giờ) gần nhất.
2. Hỏi ordering (`POST /internal/orders/existence`) mã nào có đơn thật.
3. Trả hàng về kho cho các mã **không có đơn**; ghi cảnh báo kèm danh sách mã.

**An toàn:** chỉ trả hàng khi ordering đã trả lời thành công. Ordering không trả lời (sập, treo, mạch ngắt) thì bỏ lượt và không đoán, vì trả nhầm hàng của đơn thật sẽ làm bán quá tồn kho. Duyệt phân trang theo thứ tự mới nhất trước, nên khối lượng lớn vẫn kiểm tra được lần giữ hàng mới.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ORDERING_URL` | `http://localhost:3004/api` | Địa chỉ ordering (dùng chung biến với customer) |
| `ORPHAN_SWEEP_ENABLED` | `true` | Bật job |
| `ORPHAN_SWEEP_INTERVAL_MS` | 300000 | Khoảng giữa hai lượt |
| `ORPHAN_MIN_AGE_MINUTES` | 10 | Chỉ xét lần giữ hàng cũ hơn |
| `ORPHAN_LOOKBACK_HOURS` | 24 | Chỉ xét trong khoảng gần đây |
| `DOWNSTREAM_TIMEOUT_MS`, `DOWNSTREAM_RETRY_*`, `DOWNSTREAM_BREAKER_*` | xem `shared-library.md` | Retry và ngắt mạch khi gọi ordering |

## 5. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/catalog dev                 # cần .env có JWT_PUBLIC_KEY và INTERNAL_API_KEY
pnpm --filter @phucvi/catalog test                # unit
pnpm --filter @phucvi/catalog test:integration    # cần Postgres + RabbitMQ (pnpm db:up, db:migrate)
```

Test tích hợp tạo dữ liệu riêng (slug bắt đầu bằng `it-`) rồi dọn, không đụng dữ liệu seed.

## 6. Giới hạn hiện tại

- Chưa upload ảnh: `imageUrl` chỉ nhận đường dẫn http(s) có sẵn.
- Một sản phẩm thuộc đúng một danh mục, danh mục phẳng (không có cấp cha con).
- Chưa có biến thể (size, vị) hay nhiều ảnh cho một sản phẩm.
- Chưa có cảnh báo sắp hết hàng; chưa phát sự kiện khi tồn kho hoặc giá thay đổi.
- Giữ hàng có thời hạn chỉ ở mức dọn dẹp: đơn chuyển khoản quá hạn do ordering hủy (xem `ordering-service.md` mục 3b), hàng giữ cho đơn không tồn tại do job dưới đây trả lại. Chưa có hạn giữ hàng ở giỏ hàng (trước khi đặt).
- API công khai được gateway giới hạn tốc độ theo IP; gọi thẳng vào service thì không có giới hạn (xem `gateway-service.md`).
