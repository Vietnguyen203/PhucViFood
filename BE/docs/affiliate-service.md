# Service affiliate (CTV, link giới thiệu, hoa hồng)

Thư mục: `BE/services/affiliate` (gói `@phucvi/affiliate`). Database `affiliate_db`, gồm 2 miền: `affiliate` (hồ sơ, link), `commission` (hoa hồng, chi trả). Cổng mặc định 3002. Lượt bấm link, tương tác và thống kê của CTV đã tách sang service tracking (`tracking-service.md`); affiliate vẫn là chủ của mã giới thiệu, link, thời hạn cookie và việc quyết định ghi nhận CTV cho đơn.

## 1. API

Tiền tố `/api`. JWT do service `user` ký bằng khóa riêng; service này chỉ có khóa công khai (`JWT_PUBLIC_KEY`) để kiểm tra.

**Công khai (web bán hàng, không cần đăng nhập)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/public/referrals/:code` | Kiểm tra mã khách nhập ở thanh toán còn hiệu lực |

**Nội bộ (header `x-internal-key`)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/internal/attribution/resolve` | Ordering hỏi lúc đặt hàng: đơn gắn CTV nào, có hoa hồng không, tỷ lệ bao nhiêu |
| POST | `/internal/referrals/context` | Tracking hỏi: mã (và kênh) có dùng được không. Trả `{valid:false}` hoặc `{valid:true, affiliateId, referralCode, linkId, cookieDays}`. Chỉ đọc; luôn 200 |
| GET | `/internal/affiliates/by-user/:userId` | Tra hồ sơ CTV theo tài khoản đăng nhập (ordering dùng cho màn hình đơn của CTV); 404 nếu chưa có hồ sơ |

**CTV (vai trò AFFILIATE)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST, GET, PATCH | `/me/affiliate` | Đăng ký hồ sơ (PENDING), xem, sửa họ tên và thông tin nhận tiền |
| GET, POST, PATCH | `/me/links`, `/me/links/:id` | Link theo kênh (facebook, tiktok...), tắt bật |
| GET | `/me/commissions`, `/me/commissions/:id`, `/me/commissions/summary` | Hoa hồng của mình; chỉ có mã đơn, không có thông tin khách |
| GET | `/me/payouts`, `/me/payouts/:id` | Các đợt đã được chi trả (kèm số tiền đã bị trừ nếu có) |
| GET | `/me/adjustments`, `/me/adjustments/:id` | Các khoản bị trừ vào hoa hồng do đơn hoàn sau khi đã chi (xem mục 2) |

**ADMIN**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET, PATCH | `/affiliates`, `/affiliates/:id` | Danh sách (phân trang, `q`, `filter[status]`), chi tiết, chỉnh tỷ lệ, hợp đồng, ghi chú |
| POST | `/affiliates/:id/approve` | Duyệt (bắt buộc `contractStart`; tùy chọn `contractEnd`, `commissionRateBps`) |
| POST | `/affiliates/:id/reject`, `suspend`, `reactivate` | Từ chối, tạm khóa, mở lại |
| GET | `/commissions`, `/commissions/:id` | Mọi hoa hồng (lọc `status`, `affiliateId`, `orderCode`) |
| PATCH | `/commissions/:id/confirm` | Chuyển ESTIMATED sang CONFIRMED sau khi CSKH xử lý |
| POST | `/payouts` | Chi trả: gom hoa hồng CONFIRMED của một CTV |
| GET | `/payouts`, `/payouts/:id` | Các đợt chi trả |
| GET | `/adjustments`, `/adjustments/:id` | Danh sách và chi tiết khoản trừ (lọc `filter[status]`, `filter[affiliateId]`, tìm theo mã đơn) |
| POST | `/adjustments/:id/waive` | Miễn trừ một khoản đang chờ, bắt buộc `reason` |

## 2. Quy tắc nghiệp vụ

- **Hồ sơ CTV:** tài khoản đăng nhập do service `user` tạo; CTV tự điền hồ sơ (họ tên, SĐT, mã giới thiệu, ngân hàng) ở đây, trạng thái PENDING. Mã 4-12 ký tự chữ thường và số, không trùng từ khóa hệ thống; SĐT chuẩn hóa +84. CTV không tự đổi được trạng thái, SĐT hay mã.
- **Trạng thái CTV:** PENDING → ACTIVE hoặc REJECTED; ACTIVE ⇄ SUSPENDED; REJECTED là cuối. Mỗi lần đổi phát sự kiện `affiliate.affiliate.status_changed`.
- **Ghi nhận đơn:** mã khách nhập ở thanh toán ưu tiên hơn cookie; cookie quá 30 ngày bị bỏ. Hợp đồng kiểm tra theo **ngày đặt hàng** (giờ Việt Nam): hết hạn hoặc không hợp lệ thì đơn tính khách vãng lai (`referralCodeUsed` vẫn giữ để tra cứu). CTV tự mua (SĐT khách trùng SĐT CTV) giữ `affiliateId` + `isSelfPurchase`, không có hoa hồng.
- **Hoa hồng:** `floor(giá sản phẩm × tỷ lệ / 10000)`, không tính ship, tỷ lệ chốt lúc đặt. Vòng đời: ESTIMATED (đặt hàng) → CONFIRMED (khách xác nhận nhận hàng, hoặc admin chuyển) → PAID (admin chi trả); CANCELLED khi đơn hủy hoặc hoàn. Không tự xác nhận theo ngày.
- **Chi trả:** `POST /payouts` không truyền `commissionIds` thì lấy tất cả hoa hồng CONFIRMED chưa chi của CTV. Cả đợt nằm trong một transaction; hai admin chi cùng lúc thì chỉ một đợt được tạo.
- **Đơn hoàn sau khi đã PAID (khoản trừ):** hoa hồng giữ nguyên PAID (tiền đã chuyển, lịch sử phải đúng) và hệ thống ghi một **khoản trừ** (`commission.adjustments`, bằng số hoa hồng đã chi) ở trạng thái `PENDING`. Mỗi hoa hồng có tối đa một khoản trừ (UNIQUE), nên sự kiện gửi lặp không trừ hai lần.
  - Đợt chi kế tiếp của CTV **tự trừ** các khoản chờ, cũ nhất trước, trọn từng khoản khi còn đủ tiền: thực chuyển = hoa hồng trong đợt - khoản trừ (`totalAmount`), khoản đã trừ ghi ở `adjustmentAmount`. Khoản không vừa thì giữ lại cho đợt sau; số tiền thực chuyển không bao giờ âm. Bù đúng hết thì đợt chi thực chuyển 0 đồng nhưng vẫn tất toán hoa hồng.
  - Khoản trừ thành `APPLIED` (gắn đợt chi, giờ trừ) hoặc `WAIVED`: admin **miễn trừ** bằng `POST /adjustments/:id/waive {reason}` (bắt buộc lý do, ghi người miễn; công ty chịu khoản này). Chỉ miễn được khoản đang `PENDING`.
  - CTV thấy khoản chờ trừ ở `GET /me/adjustments`, `pendingAdjustments` trong `GET /me/commissions/summary`, và `adjustment` trong chi tiết hoa hồng. Đơn hoàn **trước** khi chi thì hoa hồng bị hủy như cũ và không có khoản trừ.

## 3. Tích hợp với ordering

**Lúc đặt hàng**, ordering gọi `POST /internal/attribution/resolve` (kèm `x-internal-key`):
```json
{ "referralCode": "linh01", "cookie": { "code": "linh01", "channelCode": "facebook", "clickedAt": "...", "maxAgeDays": 30 },
  "customerPhone": "0912345678", "orderedAt": "2026-11-25T10:00:00+07:00" }
```
Trả về `affiliateId`, `linkId`, `channelCode`, `referralCodeUsed`, `attributionSource` (LINK hoặc CODE), `isSelfPurchase`, `commissionEligible`, `commissionRateBps`, `reason`. Ordering lưu kết quả này vào đơn (snapshot) và đưa `commissionRateBps` vào sự kiện.

**Sau đó**, affiliate nhận sự kiện từ RabbitMQ (queue `affiliate.commission`):

| Sự kiện | Xử lý |
|---|---|
| `ordering.order.placed` | Tạo hoa hồng ESTIMATED nếu đơn có CTV, không tự mua, có `commissionRateBps` |
| `ordering.order.status_changed` → COMPLETED | ESTIMATED → CONFIRMED (`confirmedBy` theo `receivedBy`) |
| `ordering.order.status_changed` → CANCELLED, RETURNED | ESTIMATED hoặc CONFIRMED → CANCELLED |

Xử lý **idempotent** (inbox + `order_id` UNIQUE) nên sự kiện gửi lặp không tạo trùng. Consumer chạy **tuần tự** (prefetch 1) để `COMPLETED` không vượt mặt `placed` của cùng đơn. Mỗi thay đổi hoa hồng phát `commission.commission.status_changed` qua outbox.

## 4. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `AFFILIATE_DATABASE_URL`, `RABBITMQ_URL` | bắt buộc | |
| `JWT_PUBLIC_KEY` | bắt buộc | Khóa công khai RSA (PEM hoặc base64) của cặp khóa do `pnpm jwt:keygen` sinh; service này chỉ kiểm tra token |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Khóa gọi API nội bộ |
| `PORT` | 3002 | |
| `AFFILIATE_EVENT_QUEUE` | `affiliate.commission` | |
| `OUTBOX_RELAY_ENABLED` | `true` | |

Số ngày cookie và tỷ lệ mặc định đọc từ bảng `affiliate.settings` (`cookie_days`, cache 60 giây).

## 5. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/affiliate dev                # cần .env có JWT_PUBLIC_KEY và INTERNAL_API_KEY
pnpm --filter @phucvi/affiliate test               # unit
pnpm --filter @phucvi/affiliate test:integration   # cần Postgres + RabbitMQ (pnpm db:up, db:migrate)
```

Test tích hợp tạo dữ liệu riêng (CTV `IT-*`, đơn `IT-*`) rồi dọn, không đụng dữ liệu seed.

## 6. Giới hạn hiện tại

- API công khai kiểm tra mã (`GET /public/referrals/:code`) được gateway giới hạn tốc độ theo IP (xem `gateway-service.md`).
- Mỗi lượt bấm và sự kiện mới của một mã chưa được nhớ tạm sẽ gọi `POST /internal/referrals/context` từ tracking (tracking nhớ kết quả 60 giây, mã sai 10 giây).
- Khóa nội bộ dùng chung một giá trị; chưa xoay vòng.
- Nếu xử lý một sự kiện lỗi và phải thử lại, thứ tự giữa các sự kiện của cùng đơn không còn được bảo đảm (retry đưa tin về cuối queue).
- Chưa có thông báo cho CTV khi được duyệt hoặc được chi trả.
- Khoản trừ chỉ trừ vào đợt chi kế tiếp, không thu hồi tiền mặt; CTV ngừng hoạt động sau khi bị hoàn đơn thì khoản trừ nằm chờ (admin có thể miễn trừ).
- Chưa thông báo cho CTV khi phát sinh khoản trừ.
