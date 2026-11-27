# Triển khai bằng Docker và Caddy

Chạy cả hệ thống (7 service, Postgres, RabbitMQ) trong Docker; **chỉ Caddy mở cổng ra ngoài**.

```
Internet ──► Caddy (80/443, phục vụ FE) ──► gateway ──► user · affiliate · tracking · catalog · ordering · customer
                                                     │
                                          Postgres (6 database) · RabbitMQ
```

Các service (kể cả gateway) không có `ports` trong compose: chỉ nói chuyện với nhau trong mạng Docker, gọi nhau theo tên (`catalog:3003`...). Đã kiểm tra: cổng 3000-3006 đều đóng với máy chủ.

## 1. Chạy

Cần Docker và file `.env` ở gốc repo có đủ ba giá trị (xem `.env.example`; **đều phải có**, nếu thiếu service tự dừng và báo lỗi cấu hình trong log):

| Biến | Yêu cầu | Sinh nhanh |
|---|---|---|
| `JWT_PRIVATE_KEY` | khóa riêng RSA 2048; **chỉ user service nhận** | `pnpm jwt:keygen` (in cả hai khóa) |
| `JWT_PUBLIC_KEY` | khóa công khai tương ứng; mọi service nhận để kiểm tra token | cùng lệnh trên |
| `INTERNAL_API_KEY` | từ 24 ký tự | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

```powershell
pnpm stack:up        # build image (lần đầu khoảng 3 phút) rồi bật toàn bộ
pnpm stack:logs      # xem log
pnpm stack:seed      # (tùy chọn) nạp dữ liệu mẫu, XÓA dữ liệu hiện có của từng service
pnpm stack:down      # dừng và gỡ container (dữ liệu giữ trong volume Docker)
```

Kiểm tra: `http://localhost/api/health/services` phải báo `ok` với đủ 6 service. Cổng 80 bận thì đặt `HTTP_PORT=8080` (PowerShell: `$env:HTTP_PORT="8080"; pnpm stack:up`).

`pnpm db:up` vẫn chỉ bật Postgres và RabbitMQ để dev chạy service trên máy (các service thuộc profile `app` không chạy theo).

### Migration

Mặc định mỗi service tự áp migration lúc khởi động (`RUN_MIGRATIONS=true`), tiện cho một bản sao. Khi chạy nhiều bản sao, hoặc muốn tách rủi ro migration khỏi việc khởi động, áp migration như một bước riêng trước:

```powershell
pnpm db:up                       # Postgres phải đang chạy
pnpm stack:migrate               # mỗi service có database chạy một container "chỉ áp migration rồi thoát"
$env:RUN_MIGRATIONS="false"; pnpm stack:up   # bật service, không tự áp migration nữa
```

Prisma tự khóa (advisory lock) khi áp migration, nên nhiều container cùng chạy migrate cũng không giẫm chân nhau. `MIGRATE_ONLY=true` là cơ chế của entrypoint (áp migration rồi thoát). Đã kiểm tra: áp migration thật trên database trống, và bật cả stack khi `RUN_MIGRATIONS=false`.

## 2. Biến môi trường của compose

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `HTTP_PORT`, `HTTPS_PORT` | 80, 443 | Cổng của Caddy trên máy chủ |
| `SITE_ADDRESS` | `:80` | Địa chỉ Caddy phục vụ. Đặt tên miền (vd `api.phucvifoods.vn`) thì Caddy tự lấy và gia hạn HTTPS |
| `CORS_ORIGINS` | `http://localhost:5173` | Nguồn web được phép gọi API (cách nhau bằng dấu phẩy) |
| `RATE_LIMIT_ENABLED` | `true` | Đặt `false` khi chạy bộ Postman |
| `RUN_MIGRATIONS` | `true` | `false`: service không tự áp migration (xem mục Migration) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | `postgres`/`postgres`, `phucvi`/`phucvi` | Tài khoản hạ tầng (đặt giá trị mạnh khi lên máy thật) |

Biến của từng service (cổng, địa chỉ database, địa chỉ service khác) được compose đặt sẵn theo tên trong mạng Docker, không đọc từ `.env`. Vì vậy `.env` dùng cho dev (với `localhost`) không ảnh hưởng container.

## 3. Cách hoạt động

- **Một Dockerfile** (`BE/infra/docker/Dockerfile`, ngữ cảnh build là gốc repo) cho cả 7 service, chọn bằng build arg `SERVICE`. Mỗi image chỉ cài dependency của service đó và của `shared-library`.
- **Khởi động** (`entrypoint.sh`): service có Prisma thì chạy `prisma migrate deploy` trước, rồi chạy service. Database mới được tạo bởi script `BE/infra/postgres/init` lần đầu khởi tạo volume.
- **Healthcheck** mỗi service gọi `/api/health` của chính nó; gateway chỉ khởi động khi 6 service healthy, Caddy chỉ khởi động khi gateway healthy.
- **Địa chỉ người dùng thật**: Caddy đặt `X-Forwarded-For` bằng IP người gọi (bỏ giá trị client tự gửi); gateway chạy `TRUST_PROXY_HOPS=1` nên giới hạn tốc độ tính theo IP thật. Đã kiểm tra giả 24 giá trị `X-Forwarded-For` khác nhau vẫn bị chặn 429 từ lần thứ 21.
- **Thư**: các service gửi thư qua SMTP (`MAIL_TRANSPORT`, `SMTP_*`, `MAIL_FROM`, `PUBLIC_BASE_URL` trong `.env`). Mặc định trong compose là Mailpit (xem thư ở http://localhost:8025, không gửi ra ngoài); dùng SMTP thật (Gmail, SendGrid...) thì đặt các biến này. Không đặt `MAIL_TRANSPORT` khi chạy service ngoài Docker thì thư chỉ được in ra log.
- **Ảnh sản phẩm tải lên** nằm trong volume `phucvi-uploads` (catalog, `UPLOAD_DIR=/data/uploads`): giữ khi tạo lại container, nhưng cần sao lưu cùng database. Ảnh tối đa 1 MiB nên không cần nới giới hạn của Caddy và gateway; ảnh không còn dùng (đã thay hoặc gỡ) vẫn nằm trên đĩa, chưa có việc dọn.
- **Giới hạn kích thước**: `request_body max_size` của Caddy phải bằng `MAX_BODY_BYTES` của gateway (cùng 1 MiB). Nếu Caddy cho qua mà gateway từ chối và đóng kết nối khi Caddy đang gửi dở, Caddy trả 502 thay vì 413. Đổi một chỗ thì đổi cả chỗ kia.
- **Bí mật** truyền qua biến môi trường từ `.env`; gateway không nhận khóa JWT hay khóa nội bộ. Khóa riêng JWT chỉ đưa vào user service (compose đặt riêng cho service đó), các service khác chỉ có khóa công khai nên một service bị chiếm quyền không ký giả token được.

## 4. Đã kiểm tra

Build đủ 7 image; cả stack lên healthy; 6 bộ Postman (gateway, catalog, ordering, customer, affiliate, tracking) đạt toàn bộ assertion khi gọi qua Caddy; `/internal/*` bị chặn qua Caddy; không có header `Server`; `pnpm stack:seed` nạp đúng số dòng của bộ seed.

## 5. Giới hạn hiện tại (bản demo)

- Service chạy bằng `tsx` từ mã TypeScript, image gồm cả devDependencies. Production thật nên biên dịch ra JavaScript và chỉ cài dependency chạy để image nhỏ và khởi động nhanh.
- Migration có thể tách riêng (`pnpm stack:migrate` + `RUN_MIGRATIONS=false`) nhưng chưa có quy trình rollback tự động: Prisma không có migration lùi, sửa lỗi bằng migration mới.
- Postgres (5433), RabbitMQ (5672, 15672) vẫn mở cổng ra máy chủ để tiện dev. Lên máy thật nên bỏ `ports` của hai dịch vụ này (hoặc đặt sau tường lửa) và dùng mật khẩu mạnh.
- Giao diện web (`FE/`) được build vào image `phucvi-web` (Caddy + tệp tĩnh, `BE/infra/docker/web.Dockerfile`) và Caddy phục vụ cùng nguồn với `/api`, nên không cần CORS. Đường dẫn không phải tệp trả `index.html` (react-router tự xử lý), tệp trong `/assets` cache vĩnh viễn, `index.html` không cache. Đổi mã FE thì build lại image: `docker compose --profile app build caddy`. Đã thử: image build được, Caddy trả FE, đường dẫn SPA, `/api` và `/healthz` đúng, header cache đúng.
- Trạng thái giới hạn tốc độ và ngắt mạch nằm trong bộ nhớ từng tiến trình (xem `gateway-service.md`, `shared-library.md`).
- Đã có CI kiểm tra (xem `ci.md`); chưa có CD đẩy image lên registry và tự triển khai.
