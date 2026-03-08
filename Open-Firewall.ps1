# Require Administrator
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges to add firewall rule..."
    Start-Process PowerShell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "Adding Windows Firewall Rule to allow incoming traffic on Port 80..."

# Remove existing rules if they exist to avoid duplicates
Remove-NetFirewallRule -DisplayName "Qiyas Portal - HTTP (Port 80)" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Qiyas API - HTTP (Port 8082)" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Qiyas Portal - HTTPS (Port 443)" -ErrorAction SilentlyContinue

# Add the new inbound rules
New-NetFirewallRule -DisplayName "Qiyas Portal - HTTP (Port 80)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80 -Profile Any
New-NetFirewallRule -DisplayName "Qiyas API - HTTP (Port 8082)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8082 -Profile Any
New-NetFirewallRule -DisplayName "Qiyas Portal - HTTPS (Port 443)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Any

Write-Host "=================================================="
Write-Host "SUCCESS! The firewall has been opened."
Write-Host "Other laptops on your network should now be able to access the site!"
Write-Host "=================================================="

Pause
