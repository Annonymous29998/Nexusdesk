#!/usr/bin/env bash
# One-shot local bootstrap without Docker: infra + build + migrate + seed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cp -n .env.example .env 2>/dev/null || true

echo "==> Infrastructure"
bash "$ROOT/scripts/dev-up.sh"

echo "==> Install (if needed)"
if [[ ! -d node_modules ]]; then
  npm install
fi

echo "==> Build shared packages"
npm run build -w @nexusdesk/types
npm run build -w @nexusdesk/utils
npm run build -w @nexusdesk/shared
npm run build -w @nexusdesk/ui

echo "==> Prisma generate + migrate + seed"
npm run prisma:generate -w @nexusdesk/api
# Prefer deploy for non-interactive; fall back to migrate dev
(
  cd apps/api
  if [[ -d prisma/migrations ]] && compgen -G "prisma/migrations/*/migration.sql" >/dev/null 2>&1; then
    npx prisma migrate deploy
  else
    npx prisma migrate dev --name init --skip-seed
  fi
)
npm run prisma:seed -w @nexusdesk/api

echo ""
echo "Bootstrap complete."
echo ""
echo "Start API:       npm run dev -w @nexusdesk/api"
echo "Start dashboard: npm run dev -w @nexusdesk/dashboard"
echo "Start signaling: npm run dev -w @nexusdesk/signaling"
echo ""
echo "Demo login:"
echo "  email:    admin@nexusdesk.local"
echo "  password: Admin123!"
echo "  org:      demo"
