# shared-library

Thư viện dùng chung cho mọi service NestJS: `BE/packages/shared-library` (tên gói `@phucvi/shared-library`).

Gói chỉ chứa mã nguồn TypeScript, các service import trực tiếp (chưa có bước build `dist`). Mỗi phần nằm ở một đường dẫn con để service nào cần mới nạp:

| Import | Nội dung | Phụ thuộc NestJS |
|---|---|---|
| `@phucvi/shared-library` | `utils` + `contracts` | Không |
| `@phucvi/shared-library/utils` | Quy tắc nghiệp vụ dùng chung | Không |
| `@phucvi/shared-library/contracts` | Enum, sự kiện, phong bì | Không |
| `@phucvi/shared-library/api` | Khung API chuẩn | Có |
| `@phucvi/shared-library/auth` | Kiểm tra JWT, guard, `@Public`, `@Roles`, `@CurrentUser` | Có |
| `@phucvi/shared-library/crud` | CRUD tự sinh | Có |
| `@phucvi/shared-library/messaging` | Outbox, inbox, RabbitMQ | Có |
| `@phucvi/shared-library/seed-data` | Dữ liệu mẫu cho seed | Không |

## 1. Khung API chuẩn (`/api`)

Mọi service gọi `setupApp(app)` một lần trong `main.ts`:

```ts
const app = await NestFactory.create(AppModule);
setupApp(app, { globalPrefix: 'api' });
```

`setupApp` bật: mã yêu cầu `x-request-id`, validate (bỏ và từ chối trường lạ), phong bì phản hồi, bắt lỗi thống nhất.

**Phản hồi thành công**
```json
{ "success": true, "data": { }, "meta": { "pagination": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 } }, "requestId": "..." }
```
Service trả về `PageResult(items, total, page, pageSize)` để có `meta.pagination`. Giá trị `bigint` (tiền VND từ Prisma) được đổi thành số trong JSON.

**Phản hồi lỗi**
```json
{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "Dữ liệu không hợp lệ", "details": [{ "field": "price", "messages": ["..."] }] }, "requestId": "..." }
```

| Mã lỗi | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Sai dữ liệu, query sai, id không phải UUID |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập |
| `FORBIDDEN` | 403 | Không đủ quyền |
| `NOT_FOUND` | 404 | Không có bản ghi hoặc route |
| `CONFLICT` | 409 | Trùng giá trị duy nhất (Prisma P2002), vi phạm tham chiếu (P2003) |
| `BUSINESS_RULE_VIOLATION` | 422 | Vi phạm quy tắc nghiệp vụ hoặc CHECK của DB (P2004) |
| `SERVICE_UNAVAILABLE` | 503 | Service phụ thuộc không phản hồi hoặc lỗi; client có thể thử lại |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước; chi tiết chỉ ghi log, không trả cho client |

Ném lỗi nghiệp vụ bằng `AppException`: `throw AppException.businessRule('Đơn đã giao, không thể hủy')`.

`createHealthController('tên-service')` tạo `GET /health` cho healthcheck.

**Validate body**: service chạy bằng `tsx` không phát metadata kiểu tham số, nên ValidationPipe toàn cục không biết DTO. Dùng `@ValidBody(Dto)` thay cho `@Body()`:
```ts
create(@ValidBody(CreateUserDto) dto: CreateUserDto) { ... }
```
Mọi dependency phải khai báo `@Inject(Token)` tường minh (cũng vì lý do trên). Handler có `@Param`/`@Query` thêm `@ParamTypes(String, Object)` (kiểu theo thứ tự tham số) để Nest không cảnh báo thiếu metadata.

## 1b. Xác thực dùng chung (`/auth`)

Service nào cũng import `AuthGuardsModule.forRoot({ secret, issuer, accessTtlSeconds })` với cùng cấu hình JWT. Hai guard toàn cục được đăng ký:
- `JwtAuthGuard`: **mặc định mọi route cần access token** (header `Authorization: Bearer ...`), trừ route gắn `@Public()`. Gắn `request.user`.
- `RolesGuard`: kiểm tra `@Roles('ADMIN')` gắn lên class hoặc method.

```ts
@Roles('ADMIN') @Get('orders') list(@CurrentUser() user: AuthUser) { ... }
@Public() @Get('products') catalog() { ... }
```
`InternalKeyGuard` bảo vệ API nội bộ giữa các service (header `x-internal-key`, so sánh an toàn thời gian). Dùng cùng `@Public()` và `@UseGuards(InternalKeyGuard)`; service đăng ký khóa bằng provider `INTERNAL_API_KEY`.

`verifyAccessToken` chỉ chấp nhận HS256 và đúng issuer, từ chối `alg: none`, token hết hạn, giả mạo, thiếu trường hoặc sai vai trò. Chỉ service `user` ký token (`signAccessToken`); các service khác chỉ kiểm tra. Xem `user-service.md`.

## 2. CRUD tự sinh (`/crud`)

Gồm ba phần: `PrismaCrudService` (logic), `createCrudController` (route), `parseListQuery` (cú pháp query).

```ts
// 1. DTO bằng class-validator
class CreateProductDto { @IsString() name!: string; @IsInt() @Min(0) price!: number; }

// 2. Service: dùng thẳng hoặc kế thừa để thêm nghiệp vụ
class ProductService extends PrismaCrudService {
  protected override toCreateInput(dto: CreateProductDto) { return { ...dto, price: BigInt(dto.price) }; }
}

// 3. Module
@Module({
  controllers: [createCrudController({ path: 'products', service: PRODUCT_SERVICE, createDto: CreateProductDto,
                                       decorators: [UseGuards(JwtGuard)] })],
  providers: [{
    provide: PRODUCT_SERVICE,
    inject: [PrismaService],
    useFactory: (prisma: PrismaService) => new ProductService(prisma.product, {
      label: 'Sản phẩm',
      sortableFields: ['createdAt', 'price', 'name'],
      filterableFields: { price: 'bigint', isVisible: 'boolean', categoryId: 'uuid' },
      searchableFields: ['name', 'sku'],
      softDeleteField: 'deletedAt',
    }),
  }],
})
```

Sinh ra: `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id` (cập nhật từng phần), `DELETE /products/:id` (xóa mềm nếu có `softDeleteField`). Tắt route bằng `routes: { remove: false }`.

**Cú pháp query danh sách**
```
?page=2&pageSize=20
&sort=-createdAt,name                 (dấu - là giảm dần; luôn thêm khóa phụ id để phân trang ổn định)
&q=khô cá                             (tìm không phân biệt hoa thường trong searchableFields)
&filter[status]=ACTIVE                (bằng)  |  &filter[status]=A,B   (một trong)
&filter[price][gte]=100000&filter[price][lte]=300000   (gt, gte, lt, lte)
```
`service.list(query, scope)` và `service.findOne(id, scope)` nhận thêm `scope`: điều kiện giới hạn riêng từng lần gọi, luôn được áp dụng (vd `{ affiliateId }` để CTV chỉ thấy dữ liệu của mình; bản ghi ngoài phạm vi trả 404).

Chỉ trường khai báo trong `sortableFields` và `filterableFields` mới dùng được; trường khác trả `VALIDATION_FAILED`. `pageSize` tối đa 100. Dùng `baseWhere` để giới hạn cứng theo người dùng (vd CTV chỉ thấy đơn của mình).

## 3. Messaging và transactional outbox (`/messaging`)

```
Nghiệp vụ ── cùng transaction ──> bảng outbox_events ── OutboxRelay ──> RabbitMQ ──> consumer ── Inbox (chống trùng)
```

**Ghi sự kiện cùng transaction với nghiệp vụ**
```ts
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ ... });
  await outbox.add('ordering', tx, {            // 'ordering' = Postgres schema có bảng outbox_events
    type: EventTypes.ORDER_PLACED, aggregateType: 'Order', aggregateId: order.id,
    payload: { orderId: order.id, ... },        // kiểu payload được kiểm tra theo tên sự kiện
  });
});
```
Transaction rollback thì sự kiện cũng không tồn tại (đã kiểm chứng ở test).

**OutboxRelay** đọc outbox và gửi lên RabbitMQ, có các bảo đảm:
- At-least-once: gửi lỗi thì ghi `attempts`, `last_error` và hẹn thử lại (backoff nhân đôi, tối đa 60 giây).
- Đúng thứ tự theo aggregate: sự kiện sau của cùng aggregate chỉ được gửi khi sự kiện trước đã gửi xong, kể cả lúc sự kiện trước đang chờ thử lại.
- Nhiều relay chạy song song không gửi trùng (`FOR UPDATE SKIP LOCKED`).

**Consumer**
```ts
await rabbit.subscribe({
  queue: 'affiliate.commission',
  routingKeys: [EventTypes.ORDER_PLACED, EventTypes.ORDER_STATUS_CHANGED],
  handler: async (event) => {
    await prisma.$transaction((tx) =>
      inbox.processOnce(tx, event.id, 'commission-on-order', async () => { /* tạo hoa hồng */ }));
  },
});
```
Inbox ghi `message_id` cùng transaction với xử lý, nên broker gửi lặp thì handler chỉ chạy một lần. Handler lỗi thì thử lại tối đa 3 lần (chờ 2 giây, 4 giây), sau đó chuyển vào `<queue>.dlq`.

**Gắn vào NestJS**: `MessagingModule.forRoot({ serviceName, rabbitUrl, prismaToken, outboxSchemas: ['catalog','ordering','customer'], inboxSchemas: [...] })` kết nối RabbitMQ và chạy relay theo vòng đời ứng dụng; inject `OutboxService`, `InboxService`.

**Enum và mã số** (`contracts/enums.ts`, `contracts/codes.ts`): `enums.ts` giữ TÊN chuỗi dùng ở API, JWT và sự kiện; `codes.ts` giữ MÃ SỐ lưu DB (enum số như `UserRoleCode.ADMIN = 1`) và codec chuyển qua lại:
```ts
role: UserRoleCodec.toCode('ADMIN')          // ghi DB: 1
UserRoleCodec.toName(row.role)               // trả ra ngoài: 'ADMIN'
filterableFields: { role: { codec: UserRoleCodec } }   // CRUD: client lọc bằng tên, where dùng mã số
```
Mã số không bao giờ đổi hay dùng lại (có test khóa cứng). Bảng mã đầy đủ ở `database.md`.

**Sự kiện hiện có** (`contracts/events.ts`): `user.user.created`, `ordering.order.placed`, `ordering.order.status_changed`, `affiliate.affiliate.status_changed`, `commission.commission.status_changed`. Thêm sự kiện: khai báo ở `EventTypes` và `EventPayloads`, kiểu payload tự được kiểm tra khi gọi `outbox.add`. Đổi tên hoặc đổi nghĩa payload là thay đổi phá vỡ, phải tăng `version`.

### Dọn outbox và inbox (tự động)

`MessagingModule` tự dọn định kỳ để hai bảng không phình mãi (`MessagingMaintenance`): lần đầu **60 giây sau khi service khởi động** (để service khởi động lại thường xuyên vẫn được dọn), rồi mỗi giờ.

| Việc dọn | Điều kiện xóa | Mặc định |
|---|---|---|
| `outbox_events` | **đã gửi** (`published_at`) quá hạn; sự kiện CHƯA gửi không bao giờ bị xóa, dù cũ | 7 ngày |
| `inbox_events` | đã xử lý (`processed_at`) quá hạn | 30 ngày |

Inbox giữ lâu hơn vì nó là hàng rào chống xử lý trùng: phải dài hơn thời gian một message có thể bị gửi lại, kể cả khi đưa lại từ DLQ. Mỗi schema được dọn độc lập (một schema lỗi không chặn schema khác); chạy nhiều bản sao service là an toàn.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `OUTBOX_PURGE_ENABLED` | `true` | `false` để tắt dọn dẹp |
| `OUTBOX_RETENTION_DAYS` | 7 | Giữ outbox đã gửi bao nhiêu ngày (1 đến 3650) |
| `INBOX_RETENTION_DAYS` | 30 | Giữ inbox bao nhiêu ngày |
| `MAINTENANCE_INTERVAL_MS` | 3600000 | Khoảng giữa hai lượt dọn |

Giá trị sai thì dùng mặc định và ghi cảnh báo (không làm service dừng). Tùy chọn `purge` của `MessagingModule.forRoot` được ưu tiên hơn biến môi trường.

### Dead-letter queue (DLQ): xem, đưa lại, bỏ

Message vào `<queue>.dlq` khi consumer xử lý lỗi hết số lần thử. Sau khi sửa nguyên nhân, đưa lại về queue gốc bằng lệnh (đọc `RABBITMQ_URL` từ `.env` ở gốc repo; `<queue>` là tên queue gốc, vd `affiliate.commission`, không kèm `.dlq`):

```powershell
pnpm dlq                                              # liệt kê các DLQ và số message (qua API quản trị RabbitMQ, cổng 15672)
pnpm dlq list affiliate.commission --limit 20         # xem message (type, số lần thử, lý do, nội dung); không lấy đi
pnpm dlq requeue affiliate.commission                 # đưa tất cả về queue gốc, đặt lại số lần thử
pnpm dlq requeue affiliate.commission --id <messageId> # chỉ đưa các message chỉ định
pnpm dlq discard affiliate.commission --id <messageId> # bỏ hẳn message chỉ định (bắt buộc nêu mã, không bỏ hàng loạt)
```

Cùng các hàm `listDeadLetters`, `requeueDeadLetters`, `discardDeadLetters`, `listDeadLetterQueues` dùng được từ mã. Chỉ xóa khỏi DLQ sau khi broker đã xác nhận ghi bền ở queue gốc, nên lỗi giữa chừng không làm mất message (tệ nhất là xử lý lại hai lần, và consumer đều idempotent nhờ inbox). Nếu message lại lỗi, nó đi hết số lần thử rồi quay về DLQ.

## 3b. Gọi service khác: retry và ngắt mạch (`/http`)

`callDownstream(target, method, path, body?, { idempotent? })` gọi API nội bộ (`x-internal-key`), trả `data` của phong bì chuẩn, mọi lỗi là `DownstreamError`. `createDownstreamTarget(...)` tạo đích **cho một service** kèm retry và circuit breaker; mỗi service một đích (một breaker), dùng chung cho mọi lời gọi tới service đó trong tiến trình.

**Retry** (tối đa `DOWNSTREAM_RETRY_ATTEMPTS` lần, chờ tăng gấp đôi có ngẫu nhiên hóa từ `DOWNSTREAM_RETRY_BASE_MS`, trần 2 giây):
- Chỉ lời gọi **idempotent**: GET mặc định là có; POST phải đánh dấu `idempotent: true`, và chỉ khi API phía sau chịu được gọi lặp (giữ hàng theo `orderId`, tạo-hoặc-cập-nhật khách theo SĐT, tra cứu/tính toán bằng POST).
- Chỉ thử lại khi **không kết nối được** hoặc service trả **502/503/504**. Không thử lại khi quá thời gian chờ (service đang treo, thử thêm chỉ nhân đôi thời gian chờ), 500 (thường lặp lại), hay 4xx (lỗi của yêu cầu).

**Circuit breaker** (`CLOSED -> OPEN -> HALF_OPEN`):
- `DOWNSTREAM_BREAKER_THRESHOLD` lần lỗi hạ tầng **liên tiếp** (không phản hồi, quá thời gian chờ, 5xx) thì ngắt mạch; trong `DOWNSTREAM_BREAKER_OPEN_MS` mọi lời gọi báo lỗi ngay (`code = CIRCUIT_OPEN`, `status = null`), không chạm service, không chờ hết timeout.
- Hết thời gian ngắt: chỉ một lời gọi thử được đi qua; thành công thì đóng mạch, lỗi thì ngắt lại.
- Lỗi 4xx tính là service còn khỏe (không đếm lỗi). Với nơi gọi, mạch ngắt giống "service không phản hồi" (`status = null`) nên các nhánh 503 và bồi hoàn hiện có không phải đổi.

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `DOWNSTREAM_RETRY_ATTEMPTS` | 3 | Tổng số lần thử, kể cả lần đầu; 1 = tắt retry |
| `DOWNSTREAM_RETRY_BASE_MS` | 100 | |
| `DOWNSTREAM_BREAKER_THRESHOLD` | 5 | |
| `DOWNSTREAM_BREAKER_OPEN_MS` | 10000 | |

Hiện dùng ở ordering (catalog, affiliate, customer) và customer (ordering). Trạng thái breaker nằm trong bộ nhớ từng tiến trình; chuyển trạng thái được ghi log (`Mạch tới catalog: CLOSED -> OPEN`).

## 4. Quy tắc nghiệp vụ dùng chung (`/utils`)

| Hàm | Mục đích |
|---|---|
| `normalizeVnPhone` | Chuẩn hóa SĐT về `+84xxxxxxxxx` (khớp CHECK của DB) |
| `chooseReferral` | Mã khách nhập ở thanh toán ưu tiên hơn cookie; cookie quá 30 ngày bị bỏ |
| `decideAttribution` | Quyết định gắn CTV cho đơn: hợp đồng kiểm tra theo ngày đặt hàng (giờ Việt Nam), CTV tự mua giữ `affiliate_id` + cờ nhưng không hoa hồng |
| `calculateCommission` | `floor(giá sản phẩm × bps / 10000)`, không gồm ship, tính bằng số nguyên |
| `calculateShippingFee` | Phí ship đồng giá và miễn phí từ một mức |
| `maskCustomerName` | Tên viết tắt cho CTV, vd `N.V.A` |
| `uuidv7` | Sinh id sắp xếp theo thời gian |
| `canTransitionOrder` | Luồng trạng thái đơn hợp lệ |

Hợp đồng thiếu `contractStart` hoặc `contractEnd` được hiểu là không giới hạn phía đó.

## 5. Kiểm thử

```powershell
pnpm --filter @phucvi/shared-library test              # unit + e2e API (không cần DB)
pnpm --filter @phucvi/shared-library test:integration  # cần Postgres + RabbitMQ (pnpm db:up, db:migrate)
pnpm --filter @phucvi/shared-library typecheck
```

- Unit: utils, contracts, bộ phân tích query.
- E2E API: dựng Nest app thật với CRUD tự sinh trên delegate trong bộ nhớ, gọi qua HTTP.
- Tích hợp: outbox, relay, RabbitMQ, inbox, retry và dead-letter queue trên Postgres và RabbitMQ thật; dọn outbox/inbox (schema cô lập); công cụ DLQ (xem, bỏ, đưa lại, số lần thử đặt lại).

## 6. Giới hạn hiện tại

- Xác thực mới ở mức JWT HS256 dùng khóa chung (chi tiết giới hạn ở `user-service.md`). CRUD nhận `decorators` để gắn `@Roles`.
- Service dùng thư viện qua `tsx` phải đưa `../../packages/shared-library/src/**/*.ts` vào `include` của `tsconfig.json`, nếu không decorator tham số trong thư viện bị từ chối lúc chạy.
- Retry của consumer chờ trong bộ nhớ tiến trình: nếu tiến trình tắt giữa lúc chờ thì lần thử lại đó mất (message gốc đã ack). Phù hợp demo; production nên dùng delay queue hoặc để broker redeliver.
- Đưa message DLQ về queue gốc là thao tác thủ công bằng `pnpm dlq` (chưa có tự động đưa lại hay cảnh báo khi DLQ có message; nên theo dõi số message ở `pnpm dlq` hoặc giao diện RabbitMQ).
- Thư viện pin NestJS 11 và amqplib 0.10; chưa thử với NestJS 12.
- Chưa build `dist`; khi dựng service NestJS cần cấu hình để biên dịch cả mã trong `shared-library`, hoặc thêm bước build cho gói.
- Dọn outbox/inbox chạy trong từng tiến trình service (xem mục 3); chưa có cơ chế chạy dọn riêng một nơi duy nhất.
