# CI (GitHub Actions)

File: `.github/workflows/ci.yml`. Chạy khi push vào `main` và mỗi pull request; lượt cũ của cùng nhánh bị hủy khi có commit mới. **Chỉ kiểm tra**, chưa đẩy image hay triển khai.

| Job | Làm gì | Cần dịch vụ ngoài |
|---|---|---|
| `check` | `pnpm install --frozen-lockfile`, sinh Prisma client, typecheck toàn bộ (BE và FE), test đơn vị toàn bộ, build FE, kiểm tra `docker compose config` | Không |
| `integration` | Tạo 6 database (đúng script `BE/infra/postgres/init`), áp migration, chạy `test:integration` lần lượt từng gói | Postgres 17 và RabbitMQ 4 (service container) |
| `docker` | Build image của 7 service bằng Dockerfile dùng chung (matrix, không push, cache GHA) | Không |

Node 22, pnpm theo `packageManager` trong `package.json`. Cấu hình cho test (khóa JWT, khóa nội bộ) do test tự sinh, workflow không cần secret nào.

## Chạy lại tại máy

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm -r --if-present run typecheck
pnpm -r --if-present run test
pnpm db:up                       # Postgres + RabbitMQ cho test tích hợp
pnpm db:migrate
pnpm -r --workspace-concurrency=1 --if-present run test:integration
```

## Lưu ý

- Test tích hợp chạy trên **database mới chỉ áp migration, không seed** (giống một môi trường thật mới). Vì vậy dữ liệu cấu hình mà dịch vụ bắt buộc phải có (ngưỡng phân loại khách) nằm trong migration `20261126180000_default_settings` của customer, không chỉ trong seed. Test cần dữ liệu mà môi trường thật phải tự cấu hình (tài khoản nhận chuyển khoản của ordering) thì tự tạo trong `beforeAll`.
- Các gói chạy tuần tự (`--workspace-concurrency=1`) vì dùng chung một RabbitMQ.
- Job `docker` chỉ kiểm tra image build được; chưa chạy cả stack trong CI (đã kiểm tra tay, xem `deploy.md`).
- Chưa có: đẩy image lên registry, triển khai tự động, quét lỗ hổng phụ thuộc, báo cáo độ phủ test.
