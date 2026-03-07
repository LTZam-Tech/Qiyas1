#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-../.env.example}"
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"
MIGRATION_DIR="$(cd "$(dirname "$0")" && pwd)/../db/migrations"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is not installed or not on PATH. Install Docker Desktop and retry." >&2
  exit 1
fi

echo "[qiyas-backend] starting infrastructure bootstrap..."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
else
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
fi

echo "[qiyas-backend] waiting for services to be healthy..."
sleep 10

DB_NAME=$(grep '^POSTGRES_DB=' "$ENV_FILE" | sed 's/POSTGRES_DB=//')
DB_USER=$(grep '^POSTGRES_USER=' "$ENV_FILE" | sed 's/POSTGRES_USER=//')
DB_PASS=$(grep '^POSTGRES_PASSWORD=' "$ENV_FILE" | sed 's/POSTGRES_PASSWORD=//')

export PGPASSWORD="$DB_PASS"

echo "[qiyas-backend] running database migrations..."
for migration in "$MIGRATION_DIR"/0*.sql; do
  echo "  → $(basename "$migration")"
  docker exec -i qiyas-postgres psql -U "$DB_USER" -d "$DB_NAME" -f /dev/stdin < "$migration"
done

echo "[qiyas-backend] bootstrap complete"
