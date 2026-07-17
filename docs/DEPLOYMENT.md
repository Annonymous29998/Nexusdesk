# Deployment Guide

NexusDesk does **not** require Docker. Use Node processes + managed Postgres/Redis, or Docker Compose on a single node.

## Option A — Native / VPS (no Docker)

1. Provision a Linux or macOS host with Node.js 22+.
2. Point `.env` at managed services (recommended):

| Need | Examples |
|------|----------|
| PostgreSQL | Neon, Supabase, RDS, Cloud SQL |
| Redis | Upstash, ElastiCache, Redis Cloud |
| SMTP | Resend, Postmark, Amazon SES |
| Object storage | S3, Cloudflare R2 |
| TURN | Metered.ca, Twilio, or self-hosted coturn |

3. Install and build:

```bash
cp .env.example .env   # fill production secrets
npm ci
npm run build
cd apps/api && npx prisma migrate deploy && cd ../..
```

4. Run processes with PM2 (example):

```bash
npm install -g pm2
pm2 start apps/api/dist/main.js --name nexusdesk-api
pm2 start services/signaling/dist/main.js --name nexusdesk-signaling
pm2 start services/relay/dist/main.js --name nexusdesk-relay
# Serve apps/dashboard/dist with Nginx, Caddy, or `npx serve`
pm2 save && pm2 startup
```

5. Put Nginx/Caddy in front for TLS (see `infra/nginx/`). Terminate TLS, set `COOKIE_SECURE=true`, and restrict `CORS_ORIGINS`.

Local macOS without Docker uses Homebrew instead of managed DBs:

```bash
bash scripts/dev-up-native.sh
bash scripts/bootstrap-local.sh
```

## Option B — Docker Compose (optional single-node)

```bash
cp .env.example .env
# Fill production secrets
bash scripts/deploy.sh
```

Services:

| Service | Port |
|---|---|
| Nginx edge | 8080 |
| API | 4000 |
| Dashboard | 3000 |
| Signaling | 4001 |
| Relay | 4002 |
| Postgres | 5432 |
| Redis | 6379 |

## Production checklist

1. Replace all secrets in `.env` (JWT, session, encryption, enrollment, TURN).
2. Terminate TLS at Nginx or a load balancer; set `COOKIE_SECURE=true`.
3. Configure real SMTP and S3 endpoints (`SMTP_HOST=console` is for local only).
4. Point `STUN_URLS` / `TURN_URLS` at your TURN provider or coturn.
5. Run `prisma migrate deploy` before starting API replicas.
6. Enable Redis for rate limiting / presence across API instances.
7. Restrict CORS origins to your dashboard and desktop origins.

## Health checks

- `GET /health` — liveness
- `GET /ready` — Postgres (+ Redis best-effort)
