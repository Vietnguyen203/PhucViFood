-- Tracking đã tách thành service riêng (database tracking_db). Gỡ hai bảng và schema khỏi affiliate_db.
-- LƯU Ý: lệnh này XÓA dữ liệu lượt bấm và tương tác. Môi trường có dữ liệu thật phải chuyển sang tracking_db TRƯỚC khi chạy
-- (vd pg_dump --data-only -t tracking.referral_clicks -t tracking.tracking_events từ affiliate_db rồi nạp vào tracking_db).
-- Với dev/demo, dữ liệu chỉ là bộ seed và được nạp lại bằng `pnpm --filter @phucvi/tracking db:seed`.

-- DropTable
DROP TABLE "tracking"."referral_clicks";

-- DropTable
DROP TABLE "tracking"."tracking_events";

-- DropSchema
DROP SCHEMA "tracking";
