# PowerShell script to run a single SQL migration file against your Postgres database
# Usage: .\run_single_migration.ps1 0006_create_domains.sql

param(
    [string]$MigrationFile
)

# Set your DB connection details here
$env:PGUSER = "postgres"
$env:PGPASSWORD = "your_password_here"
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGDATABASE = "qiyas"

if (-not $MigrationFile) {
    Write-Host "Please provide the migration filename as an argument."
    exit 1
}

$fullPath = Join-Path $PSScriptRoot $MigrationFile

if (-not (Test-Path $fullPath)) {
    Write-Host "Migration file not found: $fullPath"
    exit 1
}

Write-Host "Running migration: $MigrationFile"

psql -f $fullPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Migration applied successfully."
} else {
    Write-Host "Migration failed. Check the error above."
    exit 1
}
