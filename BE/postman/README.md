# Postman: kiểm thử service user

Gồm 2 file:
- `phucvi-user.postman_collection.json`: 38 request, 73 assertion, chia 4 nhóm (kiểm tra server, đăng ký/đăng nhập, phiên và refresh token, quản trị người dùng).
- `phucvi-local.postman_environment.json`: `baseUrl`, `adminEmail`, `adminPassword` (tài khoản admin của seed, chỉ dùng local).

## Chuẩn bị

```powershell
pnpm db:up                       # Postgres + RabbitMQ
pnpm db:migrate; pnpm db:seed    # có sẵn tài khoản admin để test phần quản trị
```

Chạy service user (cần `JWT_ACCESS_SECRET` từ 32 ký tự; xem `.env.example`):

```powershell
pnpm --filter @phucvi/user dev   # mặc định http://localhost:3001/api
```

Nếu cổng 3001 đã bị chiếm, đặt `PORT=3011` cho service rồi đổi `baseUrl` trong environment.

## Cách 1: trong app Postman

1. Import 2 file ở trên.
2. Chọn environment **Phúc Vị - local** (góc trên bên phải).
3. Chuột phải collection, chọn **Run collection**, chạy theo thứ tự từ trên xuống.

Các request chạy **nối tiếp nhau**: token và id được lưu vào biến collection (`accessToken`, `refreshToken`, `ctvUserId`...), nên đừng chạy lẻ khi chưa chạy các bước trước. Muốn thử lẻ một request, chạy `1.1 Đăng ký CTV` trước để có token.

## Cách 2: Postman CLI

```powershell
postman collection run BE/postman/phucvi-user.postman_collection.json -e BE/postman/phucvi-local.postman_environment.json
```

Đổi địa chỉ server khi cần: thêm `--env-var baseUrl=http://localhost:3011/api`. Cảnh báo "Postman credentials are required" chỉ liên quan việc đẩy kết quả lên cloud, không ảnh hưởng chạy local.

## Mỗi lần chạy để lại gì

Collection tạo 2 tài khoản test với email `postman-*@example.com` (không tự xóa). Dọn bằng:

```sql
delete from "user".outbox_events where payload->'payload'->>'email' like 'postman-%@example.com';
delete from "user".users where email like 'postman-%@example.com';
```

## Chưa có trong collection

- Khóa tài khoản sau 5 lần sai mật khẩu: đã được test tự động (`pnpm --filter @phucvi/user test:integration`). Không đưa vào Postman vì sẽ khóa tài khoản test và làm collection khó chạy lại.
