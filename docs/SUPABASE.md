# Supabase setup

NexusDesk uses **Postgres via Prisma**. Supabase is a managed Postgres host — no Docker required.

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a project.
2. Open **Project Settings → Database**.
3. Copy the **URI** connection string (Direct connection, port `5432`).

It looks like:

```
postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
```

or the direct host:

```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

## 2. Configure NexusDesk

```bash
bash scripts/configure-supabase.sh "postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

Or run interactively:

```bash
npm run supabase:configure
```

This writes `DATABASE_URL` into `.env` and `apps/api/.env` with `sslmode=require`.

## 3. Push schema + seed

```bash
npm run build -w @nexusdesk/types && npm run build -w @nexusdesk/utils && npm run build -w @nexusdesk/shared
npm run prisma:generate -w @nexusdesk/api
cd apps/api && npx prisma db push && npm run prisma:seed && cd ../..
```

## 4. Pack Windows agent + run

```bash
npm run pack:agent
npm run dev -w @nexusdesk/api
npm run dev -w @nexusdesk/dashboard
```

## Pooler vs direct

| Use | Port | Notes |
|-----|------|--------|
| `prisma db push` / migrations | **5432** direct | Required for DDL |
| API runtime | 5432 or 6543 session pooler | Add `?pgbouncer=true` only for transaction pooler (Prisma migrate cannot use transaction mode) |

## Redis

Supabase does not include Redis. For local/dev:

```bash
brew install redis && brew services start redis
```

The API already falls back if Redis is down (in-memory rate limits). For production, use Upstash and set `REDIS_URL`.
