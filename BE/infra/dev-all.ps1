# Bật 7 service ở chế độ dev (tsx watch), mỗi service một cửa sổ PowerShell và một cổng riêng.
# Cấu hình còn lại đọc từ .env ở thư mục gốc. Chạy: pwsh BE/infra/dev-all.ps1 (hoặc powershell -File ...)
# Cần Postgres/RabbitMQ đang chạy: pnpm db:up
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$services = @(
  @('user', 3001), @('affiliate', 3002), @('catalog', 3003), @('ordering', 3004),
  @('customer', 3005), @('tracking', 3006), @('gateway', 3000)
)
foreach ($s in $services) {
  $name, $port = $s
  $dir = Join-Path $root "BE\services\$name"
  # PORT đặt riêng cho từng cửa sổ (gateway dùng GATEWAY_PORT trong .env nên PORT không ảnh hưởng)
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle='$name :$port'; `$env:PORT=$port; Set-Location '$dir'; pnpm dev"
}
