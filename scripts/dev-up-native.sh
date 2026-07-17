#!/usr/bin/env bash
# Start Postgres + Redis on macOS/Linux without Docker (Homebrew).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_NAME="${NEXUSDESK_DB_NAME:-nexusdesk}"
DB_USER="${NEXUSDESK_DB_USER:-nexusdesk}"
DB_PASS="${NEXUSDESK_DB_PASS:-nexusdesk}"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required for native infra. Install from https://brew.sh"
  exit 1
fi

echo "==> Ensuring PostgreSQL and Redis are installed"
brew list postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
brew list redis >/dev/null 2>&1 || brew install redis

# Link postgres tools if needed
if ! command -v psql >/dev/null 2>&1; then
  brew link --force postgresql@16 >/dev/null 2>&1 || true
  export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
fi

echo "==> Starting services"
brew services start postgresql@16 >/dev/null
brew services start redis >/dev/null

# Wait for Postgres
echo "==> Waiting for PostgreSQL"
for i in $(seq 1 30); do
  if pg_isready -q 2>/dev/null || "$(brew --prefix postgresql@16)/bin/pg_isready" -q 2>/dev/null; then
    break
  fi
  sleep 1
done

PSQL_BIN="$(command -v psql || echo "$(brew --prefix postgresql@16)/bin/psql")"
CREATEDB_BIN="$(command -v createdb || echo "$(brew --prefix postgresql@16)/bin/createdb")"
CREATEUSER_BIN="$(command -v createuser || echo "$(brew --prefix postgresql@16)/bin/createuser")"

echo "==> Ensuring database role and database exist"
# Homebrew Postgres typically trusts local peer/auth for the current OS user as superuser
"$PSQL_BIN" postgres -v ON_ERROR_STOP=1 <<SQL || true
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

"$PSQL_BIN" postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 \
  || "$CREATEDB_BIN" -O "$DB_USER" "$DB_NAME"

# Grant privileges (idempotent)
"$PSQL_BIN" postgres -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
\\c ${DB_NAME}
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER SCHEMA public OWNER TO ${DB_USER};
SQL

# Wait for Redis
REDIS_CLI="$(command -v redis-cli || echo "$(brew --prefix redis)/bin/redis-cli")"
echo "==> Waiting for Redis"
for i in $(seq 1 20); do
  if "$REDIS_CLI" ping 2>/dev/null | grep -q PONG; then
    break
  fi
  sleep 1
done
"$REDIS_CLI" ping >/dev/null

# Ensure .env exists and points at local services
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "==> Created .env from .env.example"
fi

# Prefer password auth URL that works with Prisma on localhost
LOCAL_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}?schema=public"
if grep -q '^DATABASE_URL=' .env; then
  # Only rewrite if still the default docker-style URL or empty-ish
  if grep -qE '^DATABASE_URL=postgresql://nexusdesk:nexusdesk@localhost:5432/nexusdesk' .env; then
    :
  fi
else
  echo "DATABASE_URL=${LOCAL_URL}" >> .env
fi

# Development-friendly mail without Mailhog
if grep -q '^SMTP_HOST=localhost$' .env; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    # json/console transport path: empty host triggers fallback in mailer after we set console
    sed -i.bak 's/^SMTP_HOST=localhost$/SMTP_HOST=console/' .env && rm -f .env.bak
  fi
fi

echo ""
echo "Native infrastructure is ready (no Docker)."
echo "  PostgreSQL: localhost:5432  db=${DB_NAME} user=${DB_USER}"
echo "  Redis:      localhost:6379"
echo ""
echo "Next:"
echo "  bash scripts/bootstrap-local.sh"
echo "  # or manually:"
echo "  npm run prisma:migrate -w @nexusdesk/api"
echo "  npm run prisma:seed -w @nexusdesk/api"
echo "  npm run dev -w @nexusdesk/api"
echo "  npm run dev -w @nexusdesk/dashboard"
