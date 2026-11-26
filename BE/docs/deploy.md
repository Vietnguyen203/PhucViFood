# Triển khai bằng Docker và Caddy

Chạy cả hệ thống (7 service, Postgres, RabbitMQ) trong Docker; **chỉ Caddy mở cổng ra ngoài**.

```
Internet ──► Caddy (80/443) ──► gateway ──► user · affiliate · tracking · catalog · ordering · customer
                                                     │
                                          Postgres (6 database) · RabbitMQ
```

Các service (kể cả gateway) không có `ports` trong compose: chỉ nói chuyện với nhau trong mạng Docker, gọi nhau theo tên (`catalog:3003`...). Đã kiểm tra: cổng 3000-3006 đều đóng với máy chủ.

## 1. Chạy

Cần Docker và file `.env` ở gốc repo có đủ hai bí mật (xem `.env.example`; **cả hai phải có giá trị**, nếu thiếu service tự dừng và báo lỗi cấu hình trong log):

| Biến | Yêu cầu | Sinh nhanh |
|---|---|---|
| `JWT_ACCESS_SECRET` | từ 32 ký tự | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `INTERNAL_API_KEY` | từ 24 ký tự | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

```powershell
pnpm stack:up        # build image (lần đầu khoảng 3 phút) rồi bật toàn bộ
pnpm stack:logs      # xem log
pnpm stack:seed      # (tùy chọn) nạp dữ liệu mẫu, XÓA dữ liệu hiện có của từng service
pnpm stack:down      # dừng và gỡ container (dữ liệu giữ trong volume Docker)
```

Kiểm tra: `http://localhost/api/health/services` phải báo `ok` với đủ 6 service. Cổng 80 bận thì đặt `HTTP_PORT=8080` (PowerShell: `$env:HTTP_PORT="8080"; pnpm stack:up`).

`pnpm db:up` vẫn chỉ bật Postgres và RabbitMQ để dev chạy service trên máy (các service thuộc profile `app` không chạy theo).

## 2. Biến môi trường của compose

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `HTTP_PORT`, `HTTPS_PORT` | 80, 443 | Cổng của Caddy trên máy chủ |
| `SITE_ADDRESS` | `:80` | Địa chỉ Caddy phục vụ. Đặt tên miền (vd `api.phucvifoods.vn`) thì Caddy tự lấy và gia hạn HTTPS |
| `CORS_ORIGINS` | `http://localhost:5173` | Nguồn web được phép gọi API (cách nhau bằng dấu phẩy) |
| `RATE_LIMIT_ENABLED` | `true` | Đặt `false` khi chạy bộ Postman |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | `postgres`/`postgres`, `phucvi`/`phucvi` | Tài khoản hạ tầng (đặt giá trị mạnh khi lên máy thật) |

Biến của từng service (cổng, địa chỉ database, địa chỉ service khác) được compose đặt sẵn theo tên trong mạng Docker, không đọc từ `.env`. Vì vậy `.env` dùng cho dev (với `localhost`) không ảnh hưởng container.

## 3. Cách hoạt động

- **Một Dockerfile** (`BE/infra/docker/Dockerfile`, ngữ cảnh build là gốc repo) cho cả 7 service, chọn bằng build arg `SERVICE`. Mỗi image chỉ cài dependency của service đó và của `shared-library`.
- **Khởi động** (`entrypoint.sh`): service có Prisma thì chạy `prisma migrate deploy` trước, rồi chạy service. Database mới được tạo bởi script `BE/infra/postgres/init` lần đầu khởi tạo volume.
- **Healthcheck** mỗi service gọi `/api/health` của chính nó; gateway chỉ khởi động khi 6 service healthy, Caddy chỉ khởi động khi gateway healthy.
- **Địa chỉ người dùng thật**: Caddy đặt `X-Forwarded-For` bằng IP người gọi (bỏ giá trị client tự gửi); gateway chạy `TRUST_PROXY_HOPS=1` nên giới hạn tốc độ tính theo IP thật. Đã kiểm tra giả 24 giá trị `X-Forwarded-For` khác nhau vẫn bị chặn 429 từ lần thứ 21.
- **Giới hạn kích thước**: `request_body max_size` của Caddy phải bằng `MAX_BODY_BYTES` của gateway (cùng 1 MiB). Nếu Caddy cho qua mà gateway từ chối và đóng kết nối khi Caddy đang gửi dở, Caddy trả 502 thay vì 413. Đổi một chỗ thì đổi cả chỗ kia.
- **Bí mật** truyền qua biến môi trường từ `.env`; gateway không nhận bí mật JWT hay khóa nội bộ.

## 4. Đã kiểm tra

Build đủ 7 image; cả stack lên healthy; 6 bộ Postman (gateway, catalog, ordering, customer, affiliate, tracking) đạt toàn bộ assertion khi gọi qua Caddy; `/internal/*` bị chặn qua Caddy; không có header `Server`; `pnpm stack:seed` nạp đúng số dòng của bộ seed.

## 5. Giới hạn hiện tại (bản demo)

- Service chạy bằng `tsx` từ mã TypeScript, image gồm cả devDependencies. Production thật nên biên dịch ra JavaScript và chỉ cài dependency chạy để image nhỏ và khởi động nhanh.
- Mỗi bản sao service tự chạy migration lúc khởi động: một bản sao thì ổn; nhiều bản sao cùng lúc nên tách bước migration thành job riêng.
- Postgres (5433), RabbitMQ (5672, 15672) vẫn mở cổng ra máy chủ để tiện dev. Lên máy thật nên bỏ `ports` của hai dịch vụ này (hoặc đặt sau tường lửa) và dùng mật khẩu mạnh.
- Giao diện web (`FE/`) chưa đóng gói trong stack; Caddy mới chuyển `/api/*` vào gateway, đường dẫn khác trả 404.
- Trạng thái giới hạn tốc độ và ngắt mạch nằm trong bộ nhớ từng tiến trình (xem `gateway-service.md`, `shared-library.md`).
- Chưa có CI/CD đẩy image lên registry và tự triển khai.
