# Service customer (khách hàng)

Quản lý hồ sơ khách mua hàng, phân loại khách và xuất Excel. Database `customer_db`, schema `customer`, cổng 3005. **Chỉ ADMIN xem và xuất dữ liệu khách; CTV không bao giờ thấy.**

## 1. API

Tiền tố `/api`, JWT như các service khác.

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Nội bộ | `POST /internal/customers/upsert` | `x-internal-key` (ordering gọi) |
| Admin | `GET /customers` | ADMIN |
| Admin | `GET /customers/:id` (kèm 10 đơn gần nhất) | ADMIN |
| Admin | `PATCH /customers/:id` (tên, email, địa chỉ) | ADMIN |
| Admin | `POST /customers/:id/consent` `{consent: boolean}` | ADMIN |
| Admin | `GET /customers/export` (file `.xlsx`) | ADMIN |
| Admin | `GET /customers/export-logs` | ADMIN |
| Admin | `GET /customer-settings`, `PATCH /customer-settings/:key` | ADMIN |

`GET /customers`: `q` (SĐT ở mọi dạng viết, một phần SĐT, tên, email), `tier` (`NEW|RETURNING|VIP`), `activity` (`NONE|ACTIVE|AT_RISK|CHURNED`), `filter[province|firstAffiliateId|firstChannelCode|marketingConsent|createdAt]`, `sort` (`createdAt`, `fullName`, `province`, `totalSpent`, `validOrders`, `lastOrderAt`, thêm `-` để giảm dần), `page`, `pageSize`.

## 2. Quy tắc nghiệp vụ

- **Một khách = một SĐT chuẩn hóa (+84…)**. Upsert an toàn khi hai đơn đến cùng lúc (tạo, nếu trùng thì chuyển sang cập nhật).
- **Nguồn đầu tiên** (`firstAffiliateId`, `firstChannelCode`) chỉ ghi khi tạo, không bao giờ bị đơn sau ghi đè.
- Đơn sau cập nhật tên và địa chỉ mới nhất, chỉ ghi trường có gửi (không xóa email cũ).
- **Đồng ý nhận tư vấn**: tick lần đầu thì ghi `consentAt`. Không tick ở đơn sau **không** rút lại đồng ý. Chỉ admin rút bằng `/consent` (`consent:false` giữ `consentAt`, ghi `consentWithdrawnAt`).
- **Phân loại tính lúc truy vấn**, không lưu cột:
  - `tier`: `VIP` nếu số đơn ≥ `segment.vip_min_orders` hoặc tổng chi ≥ `segment.vip_min_spend`; `RETURNING` nếu số đơn ≥ `segment.returning_min_orders`; còn lại `NEW`.
  - `activity` theo ngày từ đơn gần nhất: chưa có đơn là `NONE`, ≤ `activity.active_days` là `ACTIVE`, ≤ `activity.at_risk_days` là `AT_RISK`, quá đó là `CHURNED`.
  - Số liệu đơn lấy từ ordering (đơn `CANCELLED`/`RETURNED` không tính), vì không join chéo database.
- Ngưỡng nằm ở `customer.settings` (cache 30 giây, xóa khi cập nhật; bộ ngưỡng mới được kiểm tra hợp lệ trước khi lưu).

## 3. Hiệu năng danh sách

- Không lọc/sắp xếp theo thống kê: phân trang ở DB, chỉ hỏi ordering thống kê cho khách của trang đó.
- Lọc `tier`/`activity` hoặc sắp xếp theo `totalSpent|validOrders|lastOrderAt`: xử lý trong bộ nhớ, tối đa **10.000 khách** (vượt thì báo lỗi nghiệp vụ, cần thu hẹp bộ lọc). Xuất Excel cũng bị giới hạn này.

## 4. Xuất Excel

- 16 cột (họ tên, SĐT dạng chữ, địa chỉ, nguồn, đồng ý, số đơn, tổng chi, phân loại…), giờ Việt Nam.
- Chống chèn công thức: ô bắt đầu bằng `= + - @` hoặc tab/xuống dòng được thêm dấu `'` (trừ SĐT).
- Mỗi lần xuất thành công ghi một dòng `export_logs` (admin, bộ lọc, số dòng, định dạng). **Lỗi thì không ghi log.**
- Header trả về: `X-Row-Count`, `X-Stats-Available`.

## 5. Khi ordering không khả dụng

Danh sách, chi tiết và xuất Excel vẫn chạy nhưng không có thống kê (`statsAvailable:false`, `orders/tier/activity = null`). Lọc hoặc sắp xếp theo phân loại trả 503 `SERVICE_UNAVAILABLE`.

## 6. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `CUSTOMER_DATABASE_URL`, `RABBITMQ_URL` | bắt buộc | |
| `JWT_ACCESS_SECRET` | bắt buộc, từ 32 ký tự | Cùng giá trị với service user |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Cùng giá trị với ordering |
| `ORDERING_URL` | `http://localhost:3004/api` | |
| `DOWNSTREAM_TIMEOUT_MS` | 5000 | |
| `DOWNSTREAM_RETRY_ATTEMPTS`, `DOWNSTREAM_RETRY_BASE_MS`, `DOWNSTREAM_BREAKER_THRESHOLD`, `DOWNSTREAM_BREAKER_OPEN_MS` | 3, 100, 5, 10000 | Retry và ngắt mạch khi gọi service khác (xem `shared-library.md` mục 3b) |
| `PORT` | 3005 | |
| `CORS_ORIGINS` | `http://localhost:5173` | |
| `OUTBOX_RELAY_ENABLED` | `true` | |

## 7. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/customer dev                 # cần .env; cần ordering đang chạy để có phân loại
pnpm --filter @phucvi/customer test                # unit
pnpm --filter @phucvi/customer test:integration    # cần Postgres + RabbitMQ; ordering được giả bằng máy chủ HTTP
```

Đã chạy tay đầu cuối với catalog, affiliate, ordering **thật**: đặt đơn có mã CTV tạo khách với nguồn đúng; đơn thứ hai cùng SĐT vẫn một khách, đổi địa chỉ, giữ nguồn và đồng ý; hủy đơn đưa khách từ `RETURNING` về `NEW`; xuất Excel ghi log; CTV nhận 403.

## 8. Giới hạn hiện tại

- Phân loại theo bộ nhớ giới hạn 10.000 khách; lớn hơn cần cache thống kê hoặc đồng bộ qua sự kiện.
- Chỉ xuất `.xlsx`, chưa xuất nền (job) cho tập rất lớn.
- Chưa có xóa khách hay gộp khách trùng.
