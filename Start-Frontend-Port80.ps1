Write-Host "Starting Qiyas Frontend on Port 80..."

# Stop the existing frontend server if running on 4200 (optional cleanup)
$frontendApp = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "vite" }
if ($frontendApp) {
    Stop-Process -Id $frontendApp.Id -Force
}

cd "C:\Users\Administrator\Desktop\Qiyas"
$env:Path = "C:\Program Files\nodejs;" + $env:Path

# Override Vite port to 80 via environment variable
$env:PORT = "80"
npm run dev -- --port 80 --host 0.0.0.0
