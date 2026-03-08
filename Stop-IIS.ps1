# Run this script as Administrator to free up Port 80 for the Qiyas Frontend
Write-Host "Stopping IIS (if running)..."
Stop-Service -Name W3SVC -Force -ErrorAction SilentlyContinue

Write-Host "Stopping Windows HTTP Service (HTTP.sys)..."
Stop-Service -Name http -Force

Write-Host "Port 80 has been freed successfully! You can close this window."
Pause
