# Service ordering (đơn hàng)

Thư mục: `BE/services/ordering` (gói `@phucvi/ordering`). Database `ordering_db`, schema `ordering`. Cổng mặc định 3004.

Ordering là service điều phối: khi khách đặt hàng nó gọi **affiliate** (ghi nhận CTV), **customer** (lấy khách) và **catalog** (giữ hàng), rồi tạo đơn và phát sự kiện cho các service còn lại.

## 1. API

Tiền tố `/api`. JWT do service `user` ký bằng khóa riêng; service này chỉ có khóa công khai (`JWT_PUBLIC_KEY`) để kiểm tra.

**Khách (công khai, không cần tài khoản)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/public/orders` | Đặt hàng. Header `Idempotency-Key` (8-100 ký tự chữ, số, `. _ -`) chống đặt trùng. Khách nhập email thì gửi thư xác nhận đơn (chỉ đơn mới, gửi nền; lỗi thư chỉ ghi log, không làm hỏng đơn). Có header `Authorization: Bearer` của tài khoản `CUSTOMER` hợp lệ thì đơn gắn `user_id` để khách xem lại ở `/my-orders`; token thiếu, sai, hết hạn hoặc của vai trò khác thì đặt như khách vãng lai (không báo lỗi) |
| GET | `/public/payments/options` | Cách thanh toán online đang bật: `{ vnpay: boolean }` (VNPay bật khi có `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET`) |
| GET | `/public/payments/vnpay/return?vnp_...` | Trang kết quả của cửa hàng chuyển nguyên query VNPay vào đây: kiểm tra chữ ký, đơn, số tiền rồi ghi nhận đã thanh toán (gọi lặp an toàn). Trả `{ success, valid, orderCode, message }` |
| GET | `/public/payments/vnpay/ipn?vnp_...` | IPN do VNPay gọi máy chủ. Trả JSON thẳng (không bọc `data`) `{ RspCode, Message }`: `00` thành công, `02` đã xác nhận, `01` không có đơn, `04` sai số tiền, `97` sai chữ ký, `99` lỗi. Đăng ký địa chỉ này trong trang quản trị VNPay (cần địa chỉ công khai, chạy local thì dựa vào trang kết quả) |
| POST | `/public/orders/:code/pay-url` | Body `{ phone }`. Đơn VNPay chưa thanh toán, còn hạn: trả `{ url }` sang cổng VNPay (thanh toán lại). Sai SĐT: 404; đơn không phải VNPay, đã trả, đã hủy hoặc quá hạn: 422 |
| GET | `/public/orders/:code?phone=` | Tra cứu đơn bằng mã đơn và SĐT đã dùng khi đặt |
| POST | `/public/orders/:code/confirm-received` | Khách xác nhận đã nhận hàng (chỉ khi đơn đã giao) |
| POST | `/public/orders/:code/cancel` | Khách tự hủy (chỉ khi PLACED hoặc CONFIRMED) |

Body đặt hàng: `items[{productId, quantity}]`, `customer{fullName, phone, email?, province, ward, addressLine, marketingConsent?}`, `paymentMethod` (`COD`, `BANK_QR` hoặc `VNPAY`; `VNPAY` bị từ chối nếu chưa cấu hình VNPay), `referralCode?`, `cookie?` (đúng như API click của affiliate trả về), `note?`. **Giá và tên sản phẩm không nhận từ client**, luôn lấy từ catalog; gửi thêm trường lạ bị từ chối.

Phản hồi: mã đơn `PV-yymmdd-XXXX`, trạng thái, tiền (`subtotalAmount`, `shippingFee`, `totalAmount`), `items`, và với `BANK_QR` có `transferInstructions` (ngân hàng, số tài khoản, số tiền, nội dung chuyển khoản là mã đơn). Gửi lại cùng `Idempotency-Key` trả HTTP 200 với `replayed: true`.

Tra cứu và thao tác của khách yêu cầu khớp mã đơn và SĐT; sai một trong hai đều 404 (không lộ mã đơn nào tồn tại).

**ADMIN**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/orders` | Danh sách: `filter[status]`, `filter[paymentMethod]`, `filter[paymentStatus]`, `filter[affiliateId]`, `filter[customerId]`, `filter[placedAt]`, `q` (mã, tên, SĐT), `sort`, phân trang |
| GET | `/orders/stats` | Tổng quan: số đơn theo trạng thái, đơn chờ thanh toán (đang giữ hàng), đơn chờ CSKH, đơn và doanh thu hôm nay / 7 / 30 ngày, doanh thu 14 ngày gần nhất (đủ 14 ngày, ngày không có đơn là 0). Doanh thu = tổng tiền gồm phí ship của đơn hợp lệ (không CANCELLED, RETURNED), tính theo ngày đặt, ngày theo giờ Việt Nam |
| GET | `/orders/report?from=yyyy-mm-dd&to=yyyy-mm-dd` | ADMIN. Báo cáo theo khoảng ngày (hai đầu đều tính, giờ Việt Nam, tối đa 366 ngày; sai ngày hoặc `from` > `to` trả 400): tổng đơn, doanh thu, giá trị đơn trung bình, doanh thu phí ship, đơn và doanh thu qua CTV; đơn theo trạng thái (gồm cả đơn hủy, hoàn đặt trong khoảng); theo hình thức thanh toán; doanh thu theo ngày (đủ ngày liên tiếp); 10 sản phẩm bán chạy theo doanh thu. Cùng định nghĩa doanh thu với `/orders/stats` |
| GET | `/order-settings` | Cấu hình bán hàng sửa được: `shipping.flat_fee`, `shipping.free_threshold`, `payment.hold_minutes`, `payment.bank_name`, `payment.bank_account_no`, `payment.bank_account_holder` (chưa có trong DB thì `value` null: đang dùng mặc định, riêng tài khoản ngân hàng là chưa cấu hình nên đơn chuyển khoản chưa có hướng dẫn) |
| PATCH | `/order-settings/:key` | Đổi một cấu hình `{value}`: số nguyên trong giới hạn của khóa (phí 0-10 triệu, hạn giữ 1-43.200 phút), hoặc chuỗi (tên ngân hàng, chủ tài khoản; số tài khoản 6-30 chữ số). Lưu người sửa; áp dụng ngay ở bản đang trả lời (các bản khác trong tối đa 60 giây do cache) |
| GET | `/orders/:id` | Chi tiết: sản phẩm, lịch sử trạng thái, ghi chú CSKH, ghi nhận CTV |
| POST | `/orders/:id/confirm`, `ship`, `deliver`, `complete` | Chuyển trạng thái theo luồng |
| POST | `/orders/:id/cancel`, `return` | Hủy (từ PLACED, CONFIRMED, SHIPPING) hoặc ghi nhận trả hàng (từ DELIVERED); bắt buộc `reason` |
| POST | `/orders/:id/payment` | Ghi nhận thanh toán `{status: PAID \| REFUNDED, note?}` |
| GET | `/orders/cskh-queue` | Hàng chờ CSKH: đơn DELIVERED chưa COMPLETED, giao lâu nhất lên đầu, kèm số ngày chờ và ghi chú liên hệ gần nhất |
| POST | `/orders/:id/care-notes` | Ghi chú liên hệ khách `{note, contactChannel?: CALL \| ZALO \| SMS}` |

**CTV (vai trò AFFILIATE)**

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/my-orders`, `/my-orders/:code` | CUSTOMER. Lịch sử đơn của chính mình (đơn đặt khi đã đăng nhập): danh sách phân trang (`status`, `placedAt`, mới nhất trước), chi tiết theo mã đơn kèm lịch sử trạng thái và hướng dẫn chuyển khoản. Đơn của người khác trả 404 |
| GET | `/me/orders`, `/me/orders/:id` | Đơn do mình giới thiệu. Khách chỉ hiện **tên viết tắt** (vd `N.V.A`), không có SĐT hay địa chỉ |

## 2. Quy trình đặt hàng

Mỗi bước chỉ chạy khi bước trước thành công, nên lỗi sớm thì chưa có gì phải hoàn tác:

1. **Affiliate** `resolve`: đơn gắn CTV nào, có hoa hồng không, tỷ lệ bao nhiêu. Chỉ gọi khi khách có mã hoặc cookie; không có thì tính khách vãng lai.
2. **Customer** `upsert`: tìm hoặc tạo khách theo SĐT.
3. **Catalog** `reserve`: trừ tồn kho, nhận snapshot tên, giá, quy cách.
4. **Tạo đơn** (đơn, dòng hàng, lịch sử PLACED, sự kiện `order.placed`) trong **một transaction**. Bước này lỗi thì gọi catalog `release` để trả hàng.

Tiền được tính lại ở ordering từ snapshot (không tin `lineTotal` hay `subtotal` của service khác). Phí ship theo `ordering.settings` (`shipping.flat_fee` 30.000đ; miễn phí từ `shipping.free_threshold` 500.000đ trên giá sản phẩm).

**Lỗi trả cho khách**

| HTTP | Khi nào |
|---|---|
| 400 | Dữ liệu sai (SĐT, thiếu địa chỉ, trường lạ, tổng số lượng một sản phẩm quá 1000...) |
| 409 | Không đủ tồn kho, kèm `details: [{productId, requested, available}]` |
| 422 | Có sản phẩm không còn được bán |
| 503 `SERVICE_UNAVAILABLE` | Affiliate, customer hoặc catalog không phản hồi hoặc lỗi, hoặc quá thời gian chờ. Khách có thể thử lại (dùng cùng `Idempotency-Key`) |

**Idempotency-Key:** id đơn được suy ra từ khóa, nên gửi lại hay gửi song song cùng khóa luôn ra cùng một đơn và hàng chỉ bị giữ một lần.

## 3. Luồng trạng thái

`PLACED → CONFIRMED → SHIPPING → DELIVERED → COMPLETED`; nhánh `CANCELLED` (từ PLACED, CONFIRMED, SHIPPING) và `RETURNED` (từ DELIVERED). Mọi lần đổi ghi lịch sử (`order_status_history`) và phát `ordering.order.status_changed`; cập nhật nguyên tử nên nhiều admin thao tác cùng lúc chỉ một thao tác thành công.

- **Hoàn tất:** khách tự xác nhận (`receivedBy = CUSTOMER`) hoặc admin chuyển sau khi CSKH xử lý (`ADMIN`). Hoa hồng của CTV được xác nhận theo.
- **Đơn trả trước** (chuyển khoản `BANK_QR`, VNPay `VNPAY`) phải **đã thanh toán** mới giao được (chuyển khoản do admin ghi nhận, VNPay tự ghi nhận khi cổng báo thành công).
- **Thanh toán:** COD `PENDING → PAID` (admin ghi nhận đã thu), chuyển khoản `UNPAID → PAID` (đối soát tay), `PAID → REFUNDED`. Mỗi lần đổi ghi vào lịch sử đơn (dòng có `fromStatus = toStatus` và ghi chú). Không ghi nhận thanh toán cho đơn đã hủy hoặc đã trả.
- **Hủy đơn** phát sự kiện nên catalog tự trả hàng và affiliate tự hủy hoa hồng.

## 3b. Hạn thanh toán và tự hủy đơn quá hạn

Đơn chuyển khoản (`BANK_QR`) và VNPay (`VNPAY`) khi tạo được gắn `payment_due_at` = lúc đặt + `payment.hold_minutes` (mặc định 24 giờ); khách thấy hạn này ở `transferInstructions.dueAt`, admin thấy ở `paymentDueAt`. Đơn COD không có hạn.

Job `OrderExpiryService` (mỗi `ORDER_EXPIRY_INTERVAL_MS`, mặc định 60 giây) hủy các đơn **chuyển khoản hoặc VNPay, chưa thanh toán (`UNPAID`), còn `PLACED` hoặc `CONFIRMED`, đã qua hạn**:
- Chuyển trạng thái `CANCELLED` với người thực hiện là **SYSTEM**, lý do "Quá hạn thanh toán, hệ thống tự hủy đơn", phát `order.status_changed` như mọi lần hủy khác. Catalog trả hàng về kho và affiliate hủy hoa hồng dự kiến qua sự kiện.
- Không đụng tới: đơn đã thanh toán (dù quá hạn), COD, đơn đã giao vận chuyển, đơn chưa tới hạn.
- An toàn khi chạy nhiều bản sao hoặc khi admin vừa ghi nhận thanh toán: mỗi lần hủy là một lần chuyển trạng thái có điều kiện; đơn vừa đổi trạng thái thì bị bỏ qua, không hủy hai lần.
- Đơn chuyển khoản tạo trước khi có tính năng này không có hạn (`NULL`) nên không bị hủy hàng loạt.

## 3c. Thanh toán online VNPay

Bật khi đặt `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` (xem `.env.example`); thiếu một trong hai thì service không khởi động, không đặt cả hai thì tắt VNPay (`GET /public/payments/options` trả `vnpay: false`).

1. Khách chọn `VNPAY` khi đặt hàng: đơn `UNPAID`, có hạn như chuyển khoản; phản hồi kèm `paymentUrl` (link sang cổng VNPay đã ký HMAC-SHA512) và `onlinePayment`. Giao diện chuyển khách sang cổng ngay.
2. Thanh toán xong VNPay đưa khách về `VNPAY_RETURN_URL` (mặc định `${PUBLIC_BASE_URL}/thanh-toan/vnpay`); trang này gọi `GET /public/payments/vnpay/return` với nguyên query. VNPay cũng có thể gọi IPN. Cả hai đi qua cùng một xử lý: **chỉ tin dữ liệu có chữ ký hợp lệ**, kiểm tra mã đơn (`vnp_TxnRef`) và số tiền (`vnp_Amount` = tổng × 100), thành công (`vnp_ResponseCode` và `vnp_TransactionStatus` đều `00`) thì chuyển `UNPAID -> PAID` bằng cập nhật có điều kiện (IPN và trang kết quả đến cùng lúc chỉ ghi một lần), ghi lịch sử do SYSTEM kèm mã giao dịch. Gọi lặp an toàn.
3. Thất bại hoặc khách hủy: đơn giữ nguyên `UNPAID`, khách thanh toán lại qua `POST /public/orders/:code/pay-url` đến hết hạn. Quá hạn thì job tự hủy như chuyển khoản.
4. Khách trả tiền **sau khi đơn đã hủy**: vẫn ghi nhận `PAID` kèm ghi chú "cần hoàn tiền" trong lịch sử; admin hoàn tiền qua `PAID -> REFUNDED` (hoàn tiền thật tại cổng VNPay làm tay, hệ thống chưa gọi API hoàn tiền).
5. Chưa `PAID` thì không giao hàng được (như chuyển khoản).

Chưa làm: gọi API truy vấn/hoàn tiền của VNPay; đối soát tự động cuối ngày.

## 4. Hợp đồng với các service khác

Ordering gọi API nội bộ (header `x-internal-key`):

| Service | API | Ghi chú |
|---|---|---|
| catalog | `POST /internal/stock/reserve`, `release` | Xem `catalog-service.md` |
| affiliate | `POST /internal/attribution/resolve`, `GET /internal/affiliates/by-user/:userId` | Xem `affiliate-service.md` |
| customer | `POST /internal/customers/upsert` | Xem `customer-service.md` |

`POST /internal/customers/upsert`: body `{phone (+84...), fullName, email?, province?, ward?, addressLine?, marketingConsent?, firstAffiliateId?, firstChannelCode?}`, trả `{id, phone, isNew}`. Tìm khách theo SĐT chuẩn hóa; chưa có thì tạo (lưu nguồn đầu tiên, và thời điểm đồng ý nếu `marketingConsent`); đã có thì cập nhật tên và địa chỉ gần nhất, không ghi đè nguồn đầu tiên.

Ordering cũng **cung cấp** API nội bộ (`x-internal-key`) cho catalog: `POST /internal/orders/existence` (`{orderIds[≤500]}` → `{existing: [...]}`, những mã có đơn thật), và cho customer: `POST /internal/customers/order-stats` (`{customerIds[≤500]}` → số đơn hợp lệ, tổng chi, ngày đặt gần nhất; đơn `CANCELLED`/`RETURNED` không tính; khách chưa có đơn bị bỏ qua) và `GET /internal/customers/:customerId/orders?limit=` (1..50, mặc định 10).

Sự kiện ordering phát ra: `ordering.order.placed` (kèm `commissionRateBps` để affiliate tạo hoa hồng; `items` để các service khác dùng) và `ordering.order.status_changed`.

## 5. Cấu hình

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `ORDERING_DATABASE_URL`, `RABBITMQ_URL` | bắt buộc | |
| `JWT_PUBLIC_KEY` | bắt buộc | Khóa công khai RSA (PEM hoặc base64) của cặp khóa do `pnpm jwt:keygen` sinh; service này chỉ kiểm tra token |
| `INTERNAL_API_KEY` | bắt buộc, từ 24 ký tự | Khóa gọi API nội bộ của catalog, affiliate, customer |
| `CATALOG_URL`, `AFFILIATE_URL`, `CUSTOMER_URL` | `http://localhost:3003/api`, `3002`, `3005` | |
| `DOWNSTREAM_TIMEOUT_MS` | 5000 | Thời gian chờ mỗi lần gọi service khác |
| `DOWNSTREAM_RETRY_ATTEMPTS`, `DOWNSTREAM_RETRY_BASE_MS`, `DOWNSTREAM_BREAKER_THRESHOLD`, `DOWNSTREAM_BREAKER_OPEN_MS` | 3, 100, 5, 10000 | Retry và ngắt mạch khi gọi service khác (xem `shared-library.md` mục 3b) |
| `PORT` | 3004 | |
| `OUTBOX_RELAY_ENABLED` | `true` | |
| `ORDER_EXPIRY_ENABLED` | `true` | Bật job tự hủy đơn chuyển khoản và VNPay quá hạn thanh toán |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | (trống = tắt VNPay) | Mã website và khóa bí mật VNPay; phải đặt cả hai |
| `VNPAY_URL` | sandbox VNPay | Cổng thanh toán |
| `VNPAY_RETURN_URL` | `${PUBLIC_BASE_URL}/thanh-toan/vnpay` | Trang cửa hàng VNPay đưa khách về |
| `ORDER_EXPIRY_INTERVAL_MS` | 60000 | Khoảng giữa hai lượt chạy của job |

Cấu hình trong DB (`ordering.settings`): `shipping.flat_fee`, `shipping.free_threshold`, `payment.hold_minutes` (số phút giữ hàng cho đơn chuyển khoản chưa trả, mặc định 1440 = 24 giờ), `payment.bank_name`, `payment.bank_account_no`, `payment.bank_account_holder` (giá trị mẫu, cần thay bằng tài khoản thật của công ty).

## 6. Chạy và kiểm thử

```powershell
pnpm --filter @phucvi/ordering dev                 # cần .env có JWT_PUBLIC_KEY và INTERNAL_API_KEY; cần catalog, affiliate, customer đang chạy
pnpm --filter @phucvi/ordering test                # unit
pnpm --filter @phucvi/ordering test:integration    # cần Postgres + RabbitMQ; catalog, affiliate, customer được giả bằng máy chủ HTTP
```

Test tích hợp dùng máy chủ HTTP giả (`test/integration/fake-downstream.ts`) để kiểm tra cả các nhánh lỗi: service phụ thuộc sập, treo, hết hàng, tạo đơn lỗi sau khi giữ hàng. Luồng đầu cuối với catalog, affiliate và customer **thật** đã được chạy tay (đặt hàng, giữ hàng, hoa hồng qua RabbitMQ, upsert khách, hủy đơn trả hàng).

## 7. Giới hạn hiện tại

- Bồi hoàn tức thì sau lỗi tạo đơn vẫn là cố gắng tối đa; phần hàng bị sót (catalog sập đúng lúc, hoặc ordering sập giữa lúc giữ hàng và tạo đơn) được catalog tự dọn bằng job (xem `catalog-service.md`, mục 4b).
- Khách tra cứu và hủy bằng mã đơn + SĐT; gateway giới hạn tra cứu theo IP (mặc định 30 lần/phút) để chống dò mã (xem `gateway-service.md`).
- Mã QR thanh toán chưa sinh ảnh (VietQR); mới trả thông tin chuyển khoản.
- Chưa tách đơn nhiều kiện, chưa có mã giảm giá, chưa tích hợp đơn vị vận chuyển.
- Hủy đơn đã thanh toán không tự hoàn tiền: admin ghi nhận `REFUNDED` bằng tay.
