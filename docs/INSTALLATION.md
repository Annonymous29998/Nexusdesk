# Installation Guide

## Prerequisites

- Node.js 22+
- npm 10+
- **Either** Homebrew (macOS/Linux, no Docker) **or** Docker Compose

PostgreSQL 16 and Redis 7 are required. You do **not** need Docker.

## Option A — Native (recommended without Docker)

```bash
cp .env.example .env
npm install

# Installs/starts Postgres + Redis via Homebrew, migrates, and seeds
bash scripts/bootstrap-local.sh
```

Then in two terminals:

```bash
npm run dev -w @nexusdesk/api
npm run dev -w @nexusdesk/dashboard
```

Open http://localhost:3000.

Infra only (no migrate/seed):

```bash
bash scripts/dev-up.sh          # auto: Docker if present, else Homebrew
# or force native:
bash scripts/dev-up-native.sh
```

## Option C — Supabase Postgres (recommended)

No local Postgres required. See [SUPABASE.md](SUPABASE.md).

```bash
npm run supabase:configure
cd apps/api && npx prisma db push && npm run prisma:seed && cd ../..
npm run pack:agent
npm run dev -w @nexusdesk/api
npm run dev -w @nexusdesk/dashboard
```

Then open **Support links** → generate a link → send `/join/CODE` to the Windows user.

## Demo login (after seed)

- Email: `admin@nexusdesk.local`
- Password: `Admin123!`
- Org slug: `demo`

## Agent enrollment

```bash
export API_URL=http://localhost:4000
export WS_URL=ws://localhost:4000
export AGENT_ENROLLMENT_TOKEN="<AGENT_ENROLLMENT_SECRET from .env>"
npm run build -w @nexusdesk/agent
npm run start -w @nexusdesk/agent
```

Install as a service:

- Linux: `apps/agent/scripts/install-systemd.sh`
- macOS: `apps/agent/scripts/install-launchd.sh`
- Windows: `apps/agent/scripts/install-windows.ps1`

## Production without Docker

Run Node processes on a VPS/PM2 and point `.env` at managed services:

| Need | Suggested managed service |
|------|---------------------------|
| PostgreSQL | Neon, Supabase, RDS, Cloud SQL |
| Redis | Upstash, ElastiCache, Redis Cloud |
| SMTP | Resend, Postmark, SES |
| Object storage | S3, Cloudflare R2, Backblaze B2 |
| TURN | Metered.ca, Twilio, or self-hosted coturn |

See [Deployment](DEPLOYMENT.md) for TLS, Nginx, and process management.
