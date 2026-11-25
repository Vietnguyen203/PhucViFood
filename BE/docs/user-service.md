# Service user (đăng nhập JWT)

Thư mục: `BE/services/user` (gói `@phucvi/user`). Quản lý tài khoản đăng nhập và cấp token. Database `user_db`, schema `user`.

## 1. API

Tiền tố `/api`. Mặc định **mọi route đều cần JWT**, trừ route đánh dấu công khai.

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | Công khai | Đăng ký tài khoản CTV (vai trò `AFFILIATE`), trả luôn cặp token |
| POST | `/auth/login` | Công khai | Đăng nhập bằng email và mật khẩu |
| POST | `/auth/refresh` | Công khai | Đổi refresh token lấy cặp token mới (xoay vòng) |
| POST | `/auth/logout` | Công khai | Thu hồi phiên của refresh token gửi lên |
| POST | `/auth/logout-all` | Đã đăng nhập | Thu hồi mọi phiên của người dùng |
| GET | `/auth/me` | Đã đăng nhập | Thông tin người dùng hiện tại |
| POST | `/auth/change-password` | Đã đăng nhập | Đổi mật khẩu, thu hồi phiên cũ, cấp token mới |
| GET | `/users`, `/users/:id` | ADMIN | Danh sách (phân trang, `q`, `filter[role]`, `filter[status]`, `sort`) và chi tiết |
| POST | `/users` | ADMIN | Tạo tài khoản (kể cả ADMIN) |
| PATCH | `/users/:id` | ADMIN | Đổi `role` hoặc `status` (ACTIVE, DISABLED) |
| GET | `/health` | Công khai | Healthcheck |

Không có route xóa cứng người dùng: vô hiệu hóa bằng `PATCH status=DISABLED` để các service khác vẫn tham chiếu được `user_id`.

Đăng nhập thành công trả:
```json
{ "success": true, "data": {
  "user": { "id": "...", "email": "...", "role": "ADMIN", "status": "ACTIVE", "createdAt": "...", "lastLoginAt": "..." },
  "accessToken": "<JWT>", "refreshToken": "<chuỗi ngẫu nhiên>", "tokenType": "Bearer", "expiresIn": 900 } }
```
Gọi API: `Authorization: Bearer <accessToken>`. Định dạng lỗi và phân trang theo khung chung (xem `shared-library.md`).

## 2. Mô hình token

| | Access token | Refresh token |
|---|---|---|
| Dạng | JWT HS256 (`sub`, `email`, `role`, `iss`, `exp`) | Chuỗi ngẫu nhiên 48 byte, không phải JWT |
| Hạn mặc định | 15 phút | 30 ngày |
| Lưu ở server | Không (stateless) | Chỉ lưu **băm SHA-256** trong `user.refresh_tokens` |
| Dùng để | Gọi API, các service tự kiểm tra bằng khóa chung | Chỉ để đổi lấy cặp mới |

- **Xoay vòng**: mỗi lần refresh thu hồi token cũ và cấp token mới cùng một `family_id`.
- **Phát hiện dùng lại**: dùng lại refresh token đã thu hồi (nghi bị đánh cắp) thì thu hồi **cả family**, buộc đăng nhập lại và ghi cảnh báo vào log. Hai yêu cầu refresh song song cùng một token thì chỉ một thắng; yêu cầu còn lại bị coi là dùng lại. Hệ quả: người dùng mở hai tab và refresh cùng lúc có thể bị đăng xuất.
- Đổi mật khẩu, `logout-all`, vô hiệu hóa hay đổi vai trò người dùng đều thu hồi mọi refresh token.
- Access token đã phát vẫn dùng được đến khi hết hạn (tối đa 15 phút), nhưng `/auth/me` kiểm tra lại trạng thái tài khoản nên người bị khóa không lấy được thông tin. Các service khác chỉ kiểm tra chữ ký, nên quyền cũ có thể còn tối đa 15 phút sau khi đổi vai trò.

## 3. Các biện pháp bảo mật

- Mật khẩu băm bằng bcrypt (cost 12). Chính sách: từ 8 ký tự, tối đa 72 byte (giới hạn của bcrypt, từ chối thay vì âm thầm cắt), có chữ cái và chữ số.
- Sai email và sai mật khẩu cho **cùng một thông báo**; email không tồn tại vẫn tốn thời gian so khớp băm giả, để không lộ email nào có tài khoản.
- Nhập sai 5 lần liên tiếp thì khóa 15 phút (HTTP 429). Bộ đếm tăng nguyên tử nên các lần thử song song không né được giới hạn.
- Trạng thái `DISABLED` chỉ lộ (HTTP 403) sau khi nhập đúng mật khẩu.
- Chỉ chấp nhận thuật toán HS256 và đúng `issuer`; chặn `alg: none`. Khóa ký tối thiểu 32 ký tự, thiếu thì service không khởi động.
- DTO từ chối trường lạ, nên không thể tự đăng ký làm ADMIN bằng cách gửi thêm `role`.
- Không bao giờ trả băm mật khẩu hay trạng thái khóa nội bộ ra API.
- Không thể vô hiệu hóa hoặc hạ quyền quản trị viên đang hoạt động cuối cùng.
- Đăng ký, tạo người dùng ghi sự kiện `user.user.created` vào outbox cùng transaction (service affiliate sẽ dùng để tạo hồ sơ CTV chờ duyệt).

## 4. Cấu hình (biến môi trường)

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `USER_DATABASE_URL` | bắt buộc | |
| `RABBITMQ_URL` | bắt buộc | |
| `JWT_ACCESS_SECRET` | bắt buộc, từ 32 ký tự | Mọi service dùng chung |
| `JWT_ISSUER` | `phucvi` | |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | |
| `REFRESH_TOKEN_TTL_DAYS` | 30 | |
| `PORT` | 3001 | |
| `CORS_ORIGINS` | `http://localhost:5173` | Danh sách phân cách bằng dấu phẩy |
| `BCRYPT_ROUNDS` | 12 | 4 đến 15 |
| `MAX_FAILED_LOGINS` / `LOGIN_LOCK_MINUTES` | 5 / 15 | |
| `OUTBOX_RELAY_ENABLED` | `true` | `false` để tắt relay outbox |

Thiếu hoặc sai cấu hình: service báo **tất cả** lỗi một lượt rồi dừng. Mẫu trong `.env.example`.

## 5. Chạy và kiểm thử

```powershell
pnpm db:up                       # Postgres + RabbitMQ
pnpm db:migrate; pnpm db:seed    # tạo bảng và dữ liệu mẫu
# Đặt JWT_ACCESS_SECRET trong .env (xem .env.example), sau đó:
pnpm --filter @phucvi/user dev   # http://localhost:3001/api
```

```powershell
pnpm --filter @phucvi/user test               # unit
pnpm --filter @phucvi/user test:integration   # cần Postgres + RabbitMQ đang chạy
```

Thử bằng Postman: collection và environment ở `BE/postman/` (xem `BE/postman/README.md`), chạy được cả trong app lẫn bằng Postman CLI.

Tài khoản mẫu (admin và 2 CTV) tạo bởi seed; mật khẩu dev nằm trong `BE/services/user/prisma/seed.ts`.

## 6. Giới hạn hiện tại

- Chưa giới hạn tốc độ theo IP (chỉ khóa theo tài khoản). Cần thêm khi đưa ra internet, thường làm ở Caddy hoặc gateway.
- Chưa có quên mật khẩu qua email, xác minh email, đăng nhập 2 bước.
- Token ký HS256 bằng khóa chung: service nào có khóa đều ký được token. Khi tách nhiều service nên chuyển sang khóa bất đối xứng (RS256 hoặc EdDSA) để chỉ service user giữ khóa ký.
- Khóa tài khoản theo email nên kẻ xấu có thể cố ý khóa tài khoản người khác 15 phút. Đây là đánh đổi thường gặp; giảm thiểu bằng giới hạn theo IP ở gateway.
- Service chạy bằng `tsx` (chưa có bước build production). `tsconfig.json` của service phải có `../../packages/shared-library/src/**/*.ts` trong `include`, nếu không `tsx` không áp dụng `experimentalDecorators` cho mã của thư viện.
