# Service gateway (cổng vào)

Điểm vào duy nhất của hệ thống: FE chỉ gọi `http://<gateway>:3000/api/...`, gateway chuyển tiếp tới 6 service (user, affiliate, tracking, catalog, ordering, customer). Không có database, không dùng RabbitMQ. Cổng mặc định 3000.

## 1. Việc gateway làm và không làm

| Làm | Không làm |
|---|---|
| Định tuyến theo tiền tố đường dẫn (mục 2) | Không xác thực JWT: mỗi service tự xác thực và phân quyền (mặc định từ chối), gateway chuyển nguyên `Authorization` |
| **Chặn `/internal/*`**: không nằm trong bảng định tuyến nên không bao giờ ra ngoài | Không viết lại phong bì phản hồi của service (lỗi 4xx/5xx của service đi nguyên) |
| Giới hạn tốc độ theo IP (mục 3) | Không gộp dữ liệu nhiều service trong một API |
| CORS tập trung (bỏ header CORS của service để khỏi trùng) | |
| Giới hạn kích thước nội dung gửi lên, thời gian chờ | |
| Gắn `x-request-id` (nhận lại mã hợp lệ của client) và chuyển xuống service | |
| Báo `503 SERVICE_UNAVAILABLE` chuẩn khi service sập hoặc treo | |

Chuyển tiếp theo kiểu stream: file `.xlsx` xuất khách hàng đi thẳng, không nằm trọn trong bộ nhớ gateway. Header an toàn: bỏ `x-internal-key` và `X-Forwarded-*` do client tự khai, đặt lại IP thật; bỏ `X-Powered-By`. Không ghi query string vào log (có thể chứa SĐT/email khi tìm kiếm).

## 2. Bảng định tuyến (sau `/api`)

| Service | Tiền tố |
|---|---|
| user | `/auth`, `/users` |
| affiliate | `/me/affiliate`, `/me/links`, `/me/commissions`, `/me/payouts`, `/affiliates`, `/commissions`, `/payouts`, `/public/referrals` |
| tracking | `/public/tracking`, `/me/stats`, và riêng `POST /public/referrals/click` |
| catalog | `/public/categories`, `/public/products`, `/categories`, `/products` |
| ordering | `/public/orders`, `/orders`, `/me/orders` |
| customer | `/customers`, `/customer-settings` |

Khớp theo từng đoạn, tiền tố dài nhất thắng; tuyến khớp cả phương thức và đường dẫn (`EXACT_ROUTES`) được ưu tiên hơn tiền tố, vì `/public/referrals` có hai chủ (POST `click` là tracking, `GET /public/referrals/:code` là affiliate) (`/orders` khớp `/orders/1`, không khớp `/orders-x`). Đường dẫn không có trong bảng trả `404 NOT_FOUND` chuẩn. Đường dẫn dùng `..`, `//`, `%2e`, `%2f`, `\` trả `400` (chống lách bảng định tuyến). **Thêm endpoint mới ở service thì phải thêm tiền tố vào `src/proxy/routes.ts`**, nếu không gateway trả 404.

Riêng gateway: `GET /api/health` (còn sống, dùng cho Docker/Caddy) và `GET /api/health/services` (tình trạng 6 service: `ok` hoặc `degraded`, chỉ có `up/down` và độ trễ, không lộ địa chỉ).

## 3. Giới hạn tốc độ

Theo IP, cửa sổ 1 phút, lưu trong bộ nhớ (một gateway). Mỗi yêu cầu tính vào mọi luật khớp; bị chặn thì trả `429 TOO_MANY_REQUESTS` kèm `Retry-After`. Phản hồi luôn có `X-RateLimit-Limit` và `X-RateLimit-Remaining` của luật chặt nhất.

| Luật | Áp cho | Mặc định/phút | Biến |
|---|---|---|---|
| chung | mọi yêu cầu | 300 | `RATE_LIMIT_PER_MIN` |
| `auth` | `POST /auth/login`, `/auth/register`, `/auth/refresh` | 20 | `RATE_LIMIT_AUTH_PER_MIN` |
| `public-write` | `POST /public/orders`, `POST /public/referrals/click`, `POST /public/tracking/*` | 30 | `RATE_LIMIT_PUBLIC_WRITE_PER_MIN` |
| `lookup` | `/public/orders/:code...` (tra cứu, hủy, xác nhận bằng mã đơn) | 30 | `RATE_LIMIT_LOOKUP_PER_MIN` |

**IP thật:** mặc định (`TRUST_PROXY_HOPS=0`) dùng địa chỉ kết nối trực tiếp và **bỏ qua** `X-Forwarded-For` (client tự khai được). Khi đặt gateway sau Caddy phải đặt `TRUST_PROXY_HOPS=1`, nếu không mọi người dùng cùng một IP (của Caddy) và bị chặn chung. Đặt cao hơn số proxy thật thì client giả được IP để né giới hạn.

## 4. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `GATEWAY_PORT` | 3000 | Cố ý không dùng `PORT` (`.env` chung có `PORT` của service user) |
| `USER_URL`, `AFFILIATE_URL`, `TRACKING_URL`, `CATALOG_URL`, `ORDERING_URL`, `CUSTOMER_URL` | `http://localhost:3001..3006/api` (tracking là 3006) | Dùng chung biến với các service khác |
| `CORS_ORIGINS` | `http://localhost:5173` | Cách nhau bằng dấu phẩy |
| `PROXY_TIMEOUT_MS` | 30000 | Thời gian service không gửi byte nào trước khi báo 503 |
| `HEALTH_TIMEOUT_MS` | 2000 | Mỗi lần kiểm tra `/health/services` |
| `MAX_BODY_BYTES` | 1048576 | Quá thì `413`, kể cả khi gửi kiểu chunked |
| `TRUST_PROXY_HOPS` | 0 | Xem mục 3 |
| `RATE_LIMIT_ENABLED` | `true` | `false` để tắt |

Gateway không cần `JWT_ACCESS_SECRET`, `INTERNAL_API_KEY` hay database.

## 5. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/gateway dev      # cần các service phía sau đang chạy để có dữ liệu thật
pnpm --filter @phucvi/gateway test     # unit + đầu cuối; không cần Postgres hay RabbitMQ
```

Test đầu cuối dựng gateway thật với 6 service giả (máy chủ HTTP trong tiến trình), kiểm tra: định tuyến, chặn `/internal` và đường dẫn lách, header, CORS, file nhị phân, 413 (cả chunked), 503 khi service sập/treo/ngắt giữa chừng, client bỏ giữa chừng, health, giới hạn tốc độ và IP. Đã chạy tay đầu cuối với 5 service **thật** phía sau (trước khi có tracking; tracking đã chạy tay riêng cùng affiliate, xem `tracking-service.md`) (đăng ký, đăng nhập, JWT, đặt đơn, tìm khách, xuất Excel, `/internal` bị chặn kể cả kèm khóa nội bộ đúng, 429, tắt customer thì chỉ `/customers` trả 503).

## 6. Giới hạn hiện tại

- Giới hạn tốc độ lưu trong bộ nhớ: chạy nhiều bản gateway thì mỗi bản đếm riêng; khởi động lại thì đếm lại. Cần Redis nếu mở rộng.
- Tính theo từng IP đầy đủ, chưa gom IPv6 theo dải /64.
- Chưa có TLS (để Caddy xử lý), chưa có circuit breaker (service sập thì mỗi yêu cầu vẫn thử kết nối rồi báo 503).
- Gọi thẳng vào cổng của service (3001..3006) là né gateway: ngoài môi trường dev, chỉ mở cổng gateway ra ngoài.
