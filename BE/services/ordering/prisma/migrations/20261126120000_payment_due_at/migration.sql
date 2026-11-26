-- Hạn thanh toán cho đơn chuyển khoản chưa trả: quá hạn thì job của ordering tự hủy đơn (catalog trả hàng về kho qua sự kiện).
-- Không điền lại cho đơn đã có: NULL nghĩa là không hết hạn, nên đơn cũ không bị hủy hàng loạt khi job chạy lần đầu.

-- AlterTable
ALTER TABLE "ordering"."orders" ADD COLUMN     "payment_due_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "orders_payment_due_at_idx" ON "ordering"."orders"("payment_due_at");
