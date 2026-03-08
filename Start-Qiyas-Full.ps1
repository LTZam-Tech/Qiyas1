# Require Administrator
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges to start the Qiyas Application..."
    Start-Process PowerShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "1. Killing old Node/Vite/Caddy instances to prevent port conflicts..."
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name = 'caddy.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Stop-Service -Name W3SVC -Force -ErrorAction SilentlyContinue
Stop-Service -Name WAS -Force -ErrorAction SilentlyContinue

$env:Path = "C:\Program Files\nodejs;" + $env:Path

Write-Host "2. Starting Qiyas Backend (Port 8082)..."
cd "C:\Users\Administrator\Desktop\Qiyas\backend"
Start-Process powershell -ArgumentList "-NoExit -Command `"cd C:\Users\Administrator\Desktop\Qiyas\backend; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm run dev`"" -WindowStyle Normal

Write-Host "3. Starting Qiyas Frontend on Port 4200..."
cd "C:\Users\Administrator\Desktop\Qiyas"
Start-Process powershell -ArgumentList "-NoExit -Command `"cd C:\Users\Administrator\Desktop\Qiyas; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm run dev`"" -WindowStyle Normal

Write-Host "4. Starting Caddy Secure Proxy (HTTPS Port 443)..."
Start-Process powershell -ArgumentList "-NoExit -Command `"cd C:\Users\Administrator\Desktop\Qiyas; .\caddy run`"" -WindowStyle Normal

Write-Host "=================================================="
Write-Host "SUCCESS! Your application is starting."
Write-Host "Wait 10 seconds for the backend to initialize, then visit:"
Write-Host "https://qiyas.iltizamtech.com"
Write-Host "=================================================="

Pause
