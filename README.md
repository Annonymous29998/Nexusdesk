# NexusDesk

Production-oriented remote desktop platform: secure agent enrollment, WebRTC remote control, Fastify API, React dashboard, Electron desktop client, and Docker/Nginx deployment.

## Architecture

```
apps/
  api/         Fastify + Prisma + Redis + WebSocket signaling gateway
  dashboard/   React web control plane
  desktop/     Electron operator client
  agent/       Installable remote agent (Win/macOS/Linux)
packages/
  types/ utils/ shared/ ui/
services/
  signaling/   Standalone WebRTC signaling
  relay/       TURN credential service + coturn template
infra/
  docker/ nginx/
```

## Quick start (Supabase — no Docker)

```bash
cp .env.example .env
npm install

# Paste your Supabase Postgres URI (Project Settings → Database → URI)
npm run supabase:configure

cd apps/api && npx prisma db push && npm run prisma:seed && cd ../..
npm run pack:agent

npm run dev -w @nexusdesk/api
npm run dev -w @nexusdesk/dashboard
```

**Guest Windows access:** open **Support links** → Generate link → send `/join/CODE` to the user → they install the agent → Connect from **Devices**.

Docs: [Supabase](docs/SUPABASE.md) · [Guest access](docs/GUEST_ACCESS.md)

Local Homebrew Postgres (optional): `bash scripts/bootstrap-local.sh`

Demo login after seed: `admin@nexusdesk.local` / `Admin123!` / org `demo`

## Testing

```bash
# Unit + integration (all workspaces)
npm test

# Playwright e2e (dashboard auth shell)
npm run test:e2e

# Targeted packages
npm run test -w @nexusdesk/api
npm run test -w @nexusdesk/utils
npm run test -w @nexusdesk/agent
npm run test -w @nexusdesk/signaling
npm run test -w @nexusdesk/dashboard
```

Verified locally: shared packages, API, agent, signaling, relay, dashboard, and desktop all build; unit/integration suites pass; Playwright e2e auth flows pass. Full stack runtime needs Docker (Postgres + Redis) via `bash scripts/dev-up.sh`.

## Docs

- [Installation](docs/INSTALLATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Environment](docs/ENVIRONMENT.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Database](docs/DATABASE.md)

## Roles

| Product name | Internal role |
|---|---|
| Owner | `owner` |
| Admin | `admin` |
| Technician | `operator` |
| User | `viewer` |
