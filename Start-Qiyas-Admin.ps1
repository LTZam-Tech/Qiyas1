# Require Administrator
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges to stop IIS..."
    Start-Process PowerShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "1. Disabling and Stopping IIS Services (W3SVC & WAS)..."
Set-Service -Name W3SVC -StartupType Disabled -ErrorAction SilentlyContinue
Stop-Service -Name W3SVC -Force -ErrorAction SilentlyContinue

Set-Service -Name WAS -StartupType Disabled -ErrorAction SilentlyContinue
Stop-Service -Name WAS -Force -ErrorAction SilentlyContinue

Write-Host "2. Terminating old frontend instances..."
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match "vite" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Write-Host "3. Starting Qiyas Frontend on Port 80..."
cd "C:\Users\Administrator\Desktop\Qiyas"
$env:Path = "C:\Program Files\nodejs;" + $env:Path

Write-Host "=================================================="
Write-Host "SUCCESS! Your frontend is starting on http://qiyas.iltizamtech.com"
Write-Host "DO NOT CLOSE THIS WINDOW while using the app."
Write-Host "=================================================="

npm run dev -- --port 80 --host 0.0.0.0

Pause
