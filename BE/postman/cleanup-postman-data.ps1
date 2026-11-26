# Dọn dữ liệu do các collection Postman tạo ra (chỉ xóa dòng có tiền tố "Postman" hoặc email postman-*@example.com).
# Dùng container Postgres của docker compose (mặc định: phucvi-postgres). Chạy: powershell -File BE/postman/cleanup-postman-data.ps1
param([string]$Container = 'phucvi-postgres')

function Invoke-Sql([string]$Db, [string]$Sql) {
  $Sql | docker exec -i $Container psql -U postgres -d $Db -v ON_ERROR_STOP=1 -t -A
}

# 1. affiliate: lấy id CTV test trước để dọn tracking
$affIds = (Invoke-Sql 'affiliate_db' "select id from affiliate.affiliates where full_name like 'Postman CTV%'") | Where-Object { $_ }
$idList = ($affIds | ForEach-Object { "'$_'" }) -join ','
if ($idList) {
  Invoke-Sql 'tracking_db' "delete from tracking.referral_clicks where affiliate_id in ($idList); delete from tracking.tracking_events where affiliate_id in ($idList);" | Out-Null
  Invoke-Sql 'affiliate_db' @"
delete from commission.commissions where affiliate_id in ($idList);
delete from commission.payouts where affiliate_id in ($idList);
delete from commission.outbox_events where payload->'payload'->>'affiliateId' in ($idList);
delete from affiliate.affiliate_links where affiliate_id in ($idList);
delete from affiliate.outbox_events where aggregate_id in ($idList);
delete from affiliate.affiliates where id in ($idList);
"@ | Out-Null
}

# 2. ordering: đơn của khách test
Invoke-Sql 'ordering_db' @"
create temp table _o as select id from ordering.orders where ship_name like 'Postman %';
delete from ordering.care_notes where order_id in (select id from _o);
delete from ordering.order_status_history where order_id in (select id from _o);
delete from ordering.order_items where order_id in (select id from _o);
delete from ordering.outbox_events where aggregate_id in (select id from _o);
delete from ordering.orders where id in (select id from _o);
"@ | Out-Null

# 3. catalog: sản phẩm, danh mục test
Invoke-Sql 'catalog_db' @"
create temp table _p as select id from catalog.products where name like 'Postman %';
delete from catalog.stock_movements where product_id in (select id from _p);
delete from catalog.outbox_events where aggregate_id in (select id from _p);
delete from catalog.products where id in (select id from _p);
delete from catalog.categories where name like 'Postman %';
"@ | Out-Null

# 4. customer: khách test; nhật ký xuất chỉ giữ dòng của seed (cũ nhất)
Invoke-Sql 'customer_db' @"
create temp table _c as select id from customer.customers where full_name like 'Postman %';
delete from customer.outbox_events where aggregate_id in (select id from _c);
delete from customer.customers where id in (select id from _c);
delete from customer.export_logs where id not in (select id from customer.export_logs order by created_at asc limit 1);
"@ | Out-Null

# 5. user: tài khoản test
Invoke-Sql 'user_db' @"
create temp table _u as select id from "user".users where email like 'postman-%@example.com';
delete from "user".refresh_tokens where user_id in (select id from _u);
delete from "user".outbox_events where aggregate_id in (select id from _u);
delete from "user".users where id in (select id from _u);
"@ | Out-Null

Write-Host 'Đã dọn dữ liệu Postman. Còn lại:'
Write-Host ("  user_db users: " + (Invoke-Sql 'user_db' 'select count(*) from "user".users'))
Write-Host ("  catalog_db products: " + (Invoke-Sql 'catalog_db' 'select count(*) from catalog.products'))
Write-Host ("  ordering_db orders: " + (Invoke-Sql 'ordering_db' 'select count(*) from ordering.orders'))
Write-Host ("  customer_db customers: " + (Invoke-Sql 'customer_db' 'select count(*) from customer.customers'))
Write-Host ("  affiliate_db affiliates: " + (Invoke-Sql 'affiliate_db' 'select count(*) from affiliate.affiliates'))
