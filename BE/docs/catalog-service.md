# Service catalog (danh mục, sản phẩm, tồn kho)

Thư mục: `BE/services/catalog` (gói `@phucvi/catalog`). Database `catalog_db`, schema `catalog`. Cổng mặc định 3003.

## 1. API

Tiền tố `/api`. JWT lấy từ service `user` (cùng `JWT_ACCESS_SECRET`).

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
| GET, POST, PATCH, DELETE | `/categories`, `/categories/:id` | Danh mục. Slug tự sinh từ tên (không dấu). Chỉ xóa được danh mục trống; còn sản phẩm thì tắt bằng `isActive=false` |
| GET, POST, PATCH, DELETE | `/products`, `/products/:id` | Sản phẩm. Xóa là xóa mềm (đơn cũ vẫn tham chiếu). Thấy cả hàng ẩn và tồn kho chính xác |
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
| `JWT_ACCESS_SECRET` | bắt buộc, từ 32 ký tự | Cùng giá trị với service user |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Khóa gọi API nội bộ |
| `PORT` | 3003 | |
| `CATALOG_EVENT_QUEUE` | `catalog.stock` | |
| `OUTBOX_RELAY_ENABLED` | `true` | |

## 5. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/catalog dev                 # cần .env có JWT_ACCESS_SECRET và INTERNAL_API_KEY
pnpm --filter @phucvi/catalog test                # unit
pnpm --filter @phucvi/catalog test:integration    # cần Postgres + RabbitMQ (pnpm db:up, db:migrate)
```

Test tích hợp tạo dữ liệu riêng (slug bắt đầu bằng `it-`) rồi dọn, không đụng dữ liệu seed.

## 6. Giới hạn hiện tại

- Chưa upload ảnh: `imageUrl` chỉ nhận đường dẫn http(s) có sẵn.
- Một sản phẩm thuộc đúng một danh mục, danh mục phẳng (không có cấp cha con).
- Chưa có biến thể (size, vị) hay nhiều ảnh cho một sản phẩm.
- Chưa có cảnh báo sắp hết hàng; chưa phát sự kiện khi tồn kho hoặc giá thay đổi.
- Chưa giữ hàng có thời hạn: hàng đã giữ cho đơn chỉ được trả khi đơn bị hủy hoặc ordering gọi `release`.
- API công khai chưa có giới hạn tốc độ (nên chặn ở Caddy hoặc gateway).
