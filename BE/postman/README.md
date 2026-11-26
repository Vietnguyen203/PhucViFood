# Postman: kiểm thử các service

Mỗi service một collection. Các collection mới (gateway, catalog, ordering, customer, affiliate, tracking) **gọi qua gateway** (`{{gatewayUrl}}`), đúng cách web sẽ gọi. Collection `user` gọi thẳng service user (`{{baseUrl}}`).

| File | Request | Assertion | Nội dung |
|---|---|---|---|
| `phucvi-user.postman_collection.json` | 38 | 73 | Đăng ký, đăng nhập JWT, refresh token xoay vòng, đổi mật khẩu, quản trị người dùng |
| `phucvi-gateway.postman_collection.json` | 23 | 49 | Sức khỏe, mã yêu cầu, CORS, chặn `/internal/*`, giới hạn kích thước, định tuyến tới đúng service |
| `phucvi-catalog.postman_collection.json` | 31 | 59 | Danh mục, sản phẩm, API công khai, ẩn/hiện, sổ cái tồn kho |
| `phucvi-ordering.postman_collection.json` | 38 | 74 | Đặt hàng (giá lấy từ catalog, ship, idempotency), tra cứu, luồng trạng thái, CSKH, thanh toán, kho theo đơn |
| `phucvi-customer.postman_collection.json` | 35 | 70 | Hồ sơ khách, phân loại, đồng ý tư vấn, xuất Excel và nhật ký, ngưỡng, CTV không xem được khách |
| `phucvi-affiliate.postman_collection.json` | 53 | 99 | Hồ sơ CTV, duyệt/khóa, link theo kênh, hoa hồng theo đơn, xác nhận, chi trả, đơn hoàn sau khi chi (khoản trừ) |
| `phucvi-tracking.postman_collection.json` | 25 | 48 | Bấm link, tương tác, thống kê, cookie dùng được khi đặt hàng |
| `phucvi-local.postman_environment.json` | | | `gatewayUrl`, `baseUrl` (service user), `adminEmail`, `adminPassword` (admin của seed, chỉ dùng local) |
| `cleanup-postman-data.ps1` | | | Xóa dữ liệu do các collection tạo ra |

## Chuẩn bị

```powershell
pnpm db:up                       # Postgres + RabbitMQ
pnpm db:migrate; pnpm db:seed    # có sẵn tài khoản admin của seed
```

Chạy đủ **cả 7 service** (user 3001, affiliate 3002, catalog 3003, ordering 3004, customer 3005, tracking 3006, gateway 3000) với `.env` ở thư mục gốc (xem `.env.example`; `JWT_ACCESS_SECRET` và `INTERNAL_API_KEY` phải điền, và phải **giống nhau** ở mọi service). Mỗi service một cửa sổ:

```powershell
$env:PORT="3001"; pnpm --filter @phucvi/user dev
$env:PORT="3002"; pnpm --filter @phucvi/affiliate dev
# ... tương tự catalog 3003, ordering 3004, customer 3005, tracking 3006
pnpm --filter @phucvi/gateway dev          # cổng riêng GATEWAY_PORT=3000
```

**Tắt giới hạn tốc độ của gateway khi chạy Postman**, vì collection gửi nhiều yêu cầu đăng nhập/đặt hàng từ một IP và sẽ chạm hạn mức (đăng nhập 20 lần/phút, đặt hàng 30 lần/phút): đặt `RATE_LIMIT_ENABLED=false` cho gateway. Giới hạn tốc độ đã được kiểm thử tự động (`pnpm --filter @phucvi/gateway test`), không đưa vào Postman vì sẽ chặn các request sau đó.

## Cách 1: trong app Postman

1. Import các file `.json` ở trên.
2. Chọn environment **Phúc Vị - local**.
3. Chuột phải collection, **Run collection**, chạy theo thứ tự từ trên xuống.

Các request chạy **nối tiếp nhau**: token và id được lưu vào biến collection, nên không chạy lẻ khi chưa chạy các bước trước (nhóm `0. Chuẩn bị` tạo sẵn tài khoản, sản phẩm...). Mỗi collection tự chuẩn bị dữ liệu riêng nên chạy độc lập với nhau, theo thứ tự nào cũng được.

## Chạy qua Caddy trong Docker

Khi chạy cả hệ thống bằng `pnpm stack:up` (xem `BE/docs/deploy.md`), trỏ `gatewayUrl` vào Caddy và tắt giới hạn tốc độ của stack (`RATE_LIMIT_ENABLED=false` khi `stack:up`):

```powershell
postman collection run BE/postman/phucvi-catalog.postman_collection.json -e BE/postman/phucvi-local.postman_environment.json --env-var gatewayUrl=http://localhost/api
```

Đã chạy 6 bộ này qua Caddy với toàn bộ assertion đạt.

## Cách 2: Postman CLI

```powershell
postman collection run BE/postman/phucvi-catalog.postman_collection.json -e BE/postman/phucvi-local.postman_environment.json
```

Cảnh báo "Postman credentials are required" chỉ liên quan việc đẩy kết quả lên cloud, không ảnh hưởng chạy local.

## Mỗi lần chạy để lại gì

Collection không tự xóa dữ liệu: tài khoản `postman-*@example.com`, danh mục và sản phẩm `Postman ...`, khách và đơn của khách `Postman ...`, CTV `Postman CTV ...`, lượt bấm/tương tác của CTV đó, các dòng nhật ký xuất Excel. Dọn bằng:

```powershell
powershell -File BE/postman/cleanup-postman-data.ps1
```

Script chỉ xóa dòng có tiền tố "Postman" hoặc email `postman-*@example.com`, và chỉ giữ lại dòng nhật ký xuất của seed.

Collection `customer` đổi ngưỡng phân loại tạm thời rồi khôi phục ở bước cuối (`4.5`). Nếu chạy bị dừng giữa chừng ở nhóm 4, kiểm tra `segment.vip_min_orders` (mặc định 5) bằng `GET /customer-settings`.

## Lưu ý khi đọc kết quả

- Hoa hồng và việc trả hàng về kho phát sinh từ **sự kiện RabbitMQ** (bất đồng bộ): các bước liên quan chờ 2,5 giây. Máy chậm có thể cần tăng thời gian chờ trong request tương ứng (`4.3` của affiliate, `4.1` của ordering).
- `0.2 Tình trạng 6 service` của gateway yêu cầu cả 6 service phía sau đều chạy; thiếu một service thì request này (và chỉ nó) báo lỗi.

## Chưa có trong collection

- Khóa tài khoản sau 5 lần sai mật khẩu (user): khóa tài khoản test, khó chạy lại. Đã có test tự động.
- Giới hạn tốc độ của gateway: xem trên.
- Quá thời gian chờ và ngắt mạch khi một service sập: cần tắt service giữa chừng, đã có test tự động và đã chạy tay (xem `shared-library.md` mục 3b).
