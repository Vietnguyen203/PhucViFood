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
- 3 database: `user_db` (user), `commerce_db` (catalog, ordering, customer), `affiliate_db` (affiliate, tracking, commission). Mỗi miền một Postgres schema, có `outbox_events` riêng, để tách 7 service sau này.
- Tham chiếu giữa các miền chỉ lưu UUID, không khóa ngoại.

## Cấu trúc thư mục
- `FE/`: giao diện (React + Vite, xuất từ Figma Make).
- `BE/services/`: các service (user, commerce, affiliate).
- `BE/packages/`: thư viện dùng chung.
- `BE/infra/`: Docker Compose, Postgres.
- `BE/docs/`: tài liệu database và truy vấn mẫu.
- Thư mục gốc giữ cấu hình chung của monorepo (pnpm, Turborepo, tsconfig, `.env.example`).
