#!/usr/bin/env bash
# Start local infrastructure. Uses Docker when available; otherwise Homebrew (macOS/Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cp -n .env.example .env 2>/dev/null || true

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Docker detected — starting compose services"
  docker compose -f infra/docker/docker-compose.yml up -d postgres redis
  echo "Dependencies ready (Docker)."
  echo "Run: bash scripts/bootstrap-local.sh"
  exit 0
fi

echo "Docker not available — using native Homebrew Postgres + Redis"
exec bash "$ROOT/scripts/dev-up-native.sh"
