# Service tracking (theo dõi lượt bấm và tương tác)

Ghi lại hành vi của người xem đến từ link của CTV để CTV xem thống kê. **Chỉ để thống kê, không dùng để tính tiền** (hoa hồng nằm ở service affiliate, tính từ đơn thật). Database `tracking_db`, schema `tracking`, cổng 3006. Không dùng RabbitMQ.

## 1. Phân chia với affiliate

| Việc | Service |
|---|---|
| Mã giới thiệu, link theo kênh, thời hạn cookie, quyết định đơn thuộc CTV nào | **affiliate** |
| Ghi lượt bấm, ghi tương tác, thống kê | **tracking** |

Tracking không có bảng CTV: nó lưu `affiliate_id`, `link_id` (UUID, không khóa ngoại) và hỏi affiliate qua API nội bộ khi cần:

| Gọi affiliate | Khi nào |
|---|---|
| `POST /internal/referrals/context` `{code, channel?}` | Mỗi lượt bấm và sự kiện, để biết mã có dùng được không, link nào, cookie bao nhiêu ngày |
| `GET /internal/affiliates/by-user/:userId` | Xem thống kê: tài khoản đăng nhập là CTV nào |

Cả hai là lời gọi chỉ đọc nên được retry và có circuit breaker (xem `shared-library.md` mục 3b). Kết quả tra mã được **nhớ tạm trong bộ nhớ**: 60 giây nếu hợp lệ, 10 giây nếu không (CTV vừa được duyệt không phải chờ lâu).

## 2. API

Đường dẫn công khai giữ nguyên như trước khi tách, FE không phải đổi gì (qua gateway).

| Method | Đường dẫn | Quyền | Mô tả |
|---|---|---|---|
| POST | `/public/referrals/click` | công khai | Ghi lượt bấm link `/r/{mã}?c={kênh}`. Trả `{valid:false}` hoặc `{valid:true, visitorId, cookie:{code, channelCode, clickedAt, maxAgeDays}}`; web lưu cookie (bấm sau ghi đè cookie cũ: link bấm sau cùng thắng) |
| POST | `/public/tracking/events` | công khai | Ghi tương tác `PRODUCT_VIEW`, `ADD_TO_CART`, `CHECKOUT_START`. Trả `{recorded}` |
| GET | `/me/stats?from=&to=` | AFFILIATE | Lượt bấm, người xem duy nhất, sự kiện theo kênh; mặc định 30 ngày, tối đa 366 ngày |

Cookie do tracking cấp được dùng nguyên vẹn khi đặt hàng: ordering gửi nó cho affiliate (`POST /internal/attribution/resolve`) để quyết định hoa hồng.

## 3. Khi affiliate không trả lời

| API | Hành vi | Lý do |
|---|---|---|
| click | `503 SERVICE_UNAVAILABLE`, không ghi | Không xác nhận được mã thì không cấp được cookie hợp lệ; web thử lại được |
| sự kiện | `200 {recorded:false}`, ghi log cảnh báo | Chỉ là thống kê, không được làm hỏng việc mua hàng |
| thống kê | `503` | Không biết tài khoản là CTV nào |

Mã đã được nhớ tạm vẫn bấm được trong lúc affiliate tắt (tối đa 60 giây).

## 4. Dữ liệu

`referral_clicks` (affiliate, link, kênh, visitor, trang đích, user agent) và `tracking_events` (affiliate, visitor, kênh, loại lưu `SMALLINT` + CHECK, sản phẩm). Hai bảng tăng nhanh, chưa partition (nên partition theo tháng hoặc dọn dữ liệu cũ khi lớn). Vì không phát sự kiện nên chưa có bảng `outbox_events`.

## 5. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `TRACKING_DATABASE_URL` | bắt buộc | |
| `JWT_PUBLIC_KEY` | bắt buộc | Khóa công khai RSA (PEM hoặc base64) của cặp khóa do `pnpm jwt:keygen` sinh; service này chỉ kiểm tra token |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Cùng giá trị với affiliate |
| `AFFILIATE_URL` | `http://localhost:3002/api` | |
| `DOWNSTREAM_TIMEOUT_MS`, `DOWNSTREAM_RETRY_*`, `DOWNSTREAM_BREAKER_*` | 5000 / xem `shared-library.md` | |
| `PORT` | 3006 | |
| `CORS_ORIGINS` | `http://localhost:5173` | |

## 6. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/tracking db:migrate          # tạo bảng trong tracking_db
pnpm --filter @phucvi/tracking db:seed             # dữ liệu mẫu
pnpm --filter @phucvi/tracking dev                 # cần affiliate đang chạy
pnpm --filter @phucvi/tracking test                # unit
pnpm --filter @phucvi/tracking test:integration    # cần Postgres; affiliate được giả bằng máy chủ HTTP
```

Database `tracking_db` được tạo bởi script khởi tạo Postgres (`BE/infra/postgres/init`). **Container Postgres đã tồn tại từ trước thì script này không chạy lại**; tạo tay một lần:

```powershell
docker exec phucvi-postgres psql -U postgres -c "CREATE DATABASE tracking_db;"
```

Đã chạy tay đầu cuối qua gateway với affiliate và tracking **thật**: bấm link, ghi sự kiện, thống kê, cookie dùng được cho attribution, tắt rồi bật lại affiliate (503 khi mã chưa nhớ tạm, sự kiện bỏ qua êm, mạch tự ngắt rồi tự đóng lại).

## 7. Chuyển dữ liệu từ affiliate (đã làm một lần)

Trước đây hai bảng nằm ở `affiliate_db.tracking`. Migration `20261126091000_drop_tracking` của affiliate **xóa** chúng. Với dev/demo dữ liệu chỉ là bộ seed (nạp lại bằng `db:seed` của tracking). Môi trường có dữ liệu thật phải chuyển sang `tracking_db` TRƯỚC khi chạy migration đó.

## 8. Giới hạn hiện tại

- Bộ nhớ tạm tra mã nằm trong từng tiến trình, tối đa 5.000 mục.
- Mỗi lượt bấm/sự kiện mới của một mã chưa nhớ tạm đều gọi affiliate; lượng lớn cần giới hạn ở gateway (đã có) hoặc cho affiliate phát sự kiện thay đổi trạng thái CTV để tracking tự làm mới.
- Không dedupe sự kiện lặp (cùng người xem, cùng sản phẩm, cùng loại).
- `ip_hash` có cột nhưng chưa ghi.
