# Phúc Vị Foods

Web bán thực phẩm có chương trình cộng tác viên (CTV/affiliate). Bản DEMO, 1 người làm cùng AI.

## Quy ước
- Trả lời tiếng Việt, ngắn gọn, có cấu trúc.
- Tên bảng/cột/biến bằng tiếng Anh; comment và tài liệu bằng tiếng Việt.
- Chỉ commit khi người dùng nói rõ. Không push. Không sửa file `.env`.
- HwinGroup (`C:\Users\Admin\Desktop\HwinGroup`) chỉ để tham khảo, không sao chép.

## Công nghệ
NestJS + DDD + microservice (pnpm + Turborepo), Next.js, PostgreSQL (mỗi service một database, không khóa ngoại xuyên service), Prisma, RabbitMQ (outbox), Docker Compose, Caddy, GitHub Actions. Thư viện dùng chung: `BE/packages/shared-library`.

## Dữ liệu
- Khóa chính UUID (UUIDv7 sinh ở app bằng `@default(uuid(7))` của Prisma, DB không có default).
- Tiền: số nguyên VND (BigInt), không dùng số thực.
- Enum lưu DB dạng số nguyên (SMALLINT + CHECK), mã số ở `BE/packages/shared-library/src/contracts/codes.ts` (không đổi số đã dùng). Bên ngoài DB (API, JWT, sự kiện) dùng tên chuỗi, chuyển bằng codec.
- 6 database, mỗi service một database: `user_db`, `catalog_db`, `ordering_db`, `customer_db`, `affiliate_db` (affiliate gồm 2 schema: affiliate, commission), `tracking_db` (schema tracking; chưa có `outbox_events` vì tracking không phát hay nhận sự kiện). Các service còn lại có `outbox_events` riêng.
- Tham chiếu giữa các service chỉ lưu UUID, không khóa ngoại, không join chéo database (cần dữ liệu service khác thì gọi API nội bộ hoặc nghe sự kiện).

## Cấu trúc thư mục
- `FE/`: giao diện (React + Vite, xuất từ Figma Make), gọi backend qua gateway (`/api`); xem `FE/README.md`.
- `BE/services/`: các service (gateway, user, catalog, ordering, customer, affiliate, tracking).
- `BE/packages/`: thư viện dùng chung.
- `BE/infra/`: Docker Compose (Postgres, RabbitMQ; profile `app` chạy cả 7 service + Caddy), Dockerfile dùng chung, Caddyfile.
- `BE/docs/`: tài liệu database (`database.md`), shared-library (`shared-library.md`) và truy vấn mẫu.
- Thư mục gốc giữ cấu hình chung của monorepo (pnpm, Turborepo, tsconfig, `.env.example`).
