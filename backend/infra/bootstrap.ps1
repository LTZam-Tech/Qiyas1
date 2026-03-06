param(
  [string]$EnvFile = "..\\.env.example"
)

$ErrorActionPreference = "Stop"

Write-Host "[qiyas-backend] starting infrastructure bootstrap..."

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
  throw "Docker CLI is not installed or not on PATH. Install Docker Desktop and retry."
}

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

Push-Location $PSScriptRoot
try {
  $composeFile = Join-Path $PSScriptRoot "docker-compose.yml"
  $hasDockerCompose = Get-Command docker-compose -ErrorAction SilentlyContinue
  if ($hasDockerCompose) {
    docker-compose --env-file $EnvFile -f $composeFile up -d
  }
  else {
    docker compose version | Out-Null
    docker compose --env-file $EnvFile -f $composeFile up -d
  }

  Write-Host "[qiyas-backend] waiting for postgres..."
  Start-Sleep -Seconds 8

  $migration1 = Resolve-Path "..\\db\\migrations\\0001_init.sql"
  $migration2 = Resolve-Path "..\\db\\migrations\\0002_seed_rbac.sql"
  $migration3 = Resolve-Path "..\\db\\migrations\\0003_completion_engine.sql"

  $envContent = Get-Content $EnvFile
  $dbName = ($envContent | Where-Object { $_ -match '^POSTGRES_DB=' }) -replace '^POSTGRES_DB=', ''
  $dbUser = ($envContent | Where-Object { $_ -match '^POSTGRES_USER=' }) -replace '^POSTGRES_USER=', ''
  $dbPass = ($envContent | Where-Object { $_ -match '^POSTGRES_PASSWORD=' }) -replace '^POSTGRES_PASSWORD=', ''

  $env:PGPASSWORD = $dbPass
  Get-Content $migration1 -Raw | docker exec -i qiyas-postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
  Get-Content $migration2 -Raw | docker exec -i qiyas-postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
  Get-Content $migration3 -Raw | docker exec -i qiyas-postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName

  Write-Host "[qiyas-backend] bootstrap complete"
}
finally {
  Pop-Location
}
