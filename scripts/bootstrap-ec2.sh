#!/usr/bin/env bash
# One-shot EC2 bootstrap: Docker, clone, production .env, deploy.
# Run on a fresh Ubuntu 24.04 server as the ubuntu user.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Annonymous29998/Nexusdesk.git}"
APP_DOMAIN="${APP_DOMAIN:-nesuxdesk.xyz}"
APP_FRONTEND_URL="${APP_FRONTEND_URL:-https://www.${APP_DOMAIN}}"
API_HOST="${API_HOST:-api.${APP_DOMAIN}}"

echo "==> Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

if ! groups | grep -q docker; then
  echo "Add docker group — log out/in or run: newgrp docker"
  sudo usermod -aG docker "$USER"
  exec sg docker "$0"
fi

echo "==> Installing git..."
sudo apt-get install -y git

echo "==> Cloning repository..."
if [[ ! -d "$HOME/Nexusdesk" ]]; then
  git clone "$REPO_URL" "$HOME/Nexusdesk"
fi
cd "$HOME/Nexusdesk"

echo "==> Writing production .env..."
JWT_ACCESS_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
JWT_REFRESH_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
SESSION_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
AGENT_ENROLLMENT_SECRET="$(openssl rand -base64 32 | tr -d '\n')"
INTERNAL_API_TOKEN="$(openssl rand -base64 32 | tr -d '\n')"

cat > .env <<EOF
NODE_ENV=production
LOG_LEVEL=info

APP_URL=${APP_FRONTEND_URL}
API_URL=${APP_FRONTEND_URL}/api
WS_URL=wss://${API_HOST}/ws
CDN_URL=${APP_FRONTEND_URL}

DATABASE_URL=postgresql://nexusdesk:nexusdesk@postgres:5432/nexusdesk?schema=public
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

REDIS_URL=redis://redis:6379
REDIS_PREFIX=nexusdesk:

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
JWT_ISSUER=nexusdesk
JWT_AUDIENCE=nexusdesk-api

SESSION_SECRET=${SESSION_SECRET}
COOKIE_SECURE=true
COOKIE_DOMAIN=.${APP_DOMAIN}
COOKIE_SAME_SITE=lax

ENCRYPTION_KEY=${ENCRYPTION_KEY}

AGENT_ENROLLMENT_SECRET=${AGENT_ENROLLMENT_SECRET}
AGENT_HEARTBEAT_INTERVAL_MS=30000
AGENT_OFFLINE_THRESHOLD_MS=90000

STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=
TURN_USERNAME=
TURN_CREDENTIAL=
TURN_CREDENTIAL_TTL=86400

SMTP_HOST=console
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=NexusDesk <noreply@${APP_DOMAIN}>

S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=nexusdesk
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_AUTH_MAX=20

CORS_ORIGINS=${APP_FRONTEND_URL},https://${APP_DOMAIN}

OTEL_ENABLED=false
SENTRY_DSN=
SENTRY_ENVIRONMENT=production

FEATURE_VIEW_ONLY_DEFAULT=false
FEATURE_RECORDING_ENABLED=true
FEATURE_AUDIT_RETENTION_DAYS=90

INTERNAL_API_TOKEN=${INTERNAL_API_TOKEN}
SERVICE_NAME=nexusdesk

VITE_API_URL=${APP_FRONTEND_URL}/api
VITE_WS_URL=wss://${API_HOST}/ws
VITE_DEMO_MODE=auto
EOF

echo "==> Deploying stack (this may take several minutes)..."
bash scripts/deploy.sh

echo "==> Health check..."
sleep 5
curl -sf http://localhost:8080/health && echo "" || echo "WARN: health check failed — run: docker compose -f infra/docker/docker-compose.yml ps"

echo ""
echo "Done. Stack is on port 8080."
echo "Next: point ${APP_DOMAIN} A record to this server's Elastic IP, then add HTTPS."
