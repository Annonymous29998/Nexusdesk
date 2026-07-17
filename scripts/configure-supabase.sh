#!/usr/bin/env bash
# Configure NexusDesk to use Supabase Postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Paste your Supabase Postgres connection string."
  echo ""
  echo "IMPORTANT: use the SESSION POOLER URI (IPv4-friendly)."
  echo "  Supabase -> Connect -> Session pooler -> URI"
  echo "  (Direct db.*.supabase.co is IPv6-only and fails with P1001 on most networks.)"
  echo ""
  read -r -p "DATABASE_URL: " URL
fi

if [[ ! "$URL" =~ ^postgres ]]; then
  echo "Expected a postgresql:// URL"
  exit 1
fi

# Ensure sslmode for Supabase
if [[ "$URL" != *"sslmode="* ]]; then
  if [[ "$URL" == *"?"* ]]; then
    URL="${URL}&sslmode=require"
  else
    URL="${URL}?sslmode=require"
  fi
fi

# Ensure schema=public for Prisma
if [[ "$URL" != *"schema="* ]]; then
  if [[ "$URL" == *"?"* ]]; then
    URL="${URL}&schema=public"
  else
    URL="${URL}?schema=public"
  fi
fi

cp -n .env.example .env 2>/dev/null || true

# Write safely via Node (avoids sed treating & specially). Pass URL through env.
NEXUSDESK_DB_URL="$URL" node <<'NODE'
const fs = require('fs');
const path = require('path');
const url = process.env.NEXUSDESK_DB_URL;
if (!url) {
  console.error('No URL provided');
  process.exit(1);
}
for (const file of ['.env', 'apps/api/.env']) {
  const p = path.join(process.cwd(), file);
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  if (/^DATABASE_URL=.*$/m.test(text)) {
    text = text.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL=' + url);
  } else {
    text += (text.endsWith('\n') || text === '' ? '' : '\n') + 'DATABASE_URL=' + url + '\n';
  }
  fs.writeFileSync(p, text);
}
console.log('Updated DATABASE_URL in .env and apps/api/.env');
NODE

echo ""
echo "Next (run each block from project root):"
echo "  cd apps/api && npx prisma db push && npm run prisma:seed && cd ../.."
echo "  npm run pack:agent"
echo "  npm run dev -w @nexusdesk/api"
