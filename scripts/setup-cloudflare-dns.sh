#!/usr/bin/env bash
# Migrate nesuxdesk.xyz DNS to Cloudflare for stable global resolution.
# Usage:
#   export CF_API_TOKEN="your-cloudflare-api-token"   # Zone:Edit + DNS:Edit
#   ./scripts/setup-cloudflare-dns.sh
#
# Then update nameservers at NameSilo (registrar) to the Cloudflare NS printed below.
set -euo pipefail

DOMAIN="${DOMAIN:-nesuxdesk.xyz}"
ORIGIN_IP="${ORIGIN_IP:-3.128.135.95}"
CF_API_TOKEN="${CF_API_TOKEN:-}"

if [[ -z "$CF_API_TOKEN" ]]; then
  echo "ERROR: Set CF_API_TOKEN (Cloudflare API token with Zone:Edit + DNS:Edit)."
  echo ""
  echo "Manual steps:"
  echo "  1. https://dash.cloudflare.com → Add site → $DOMAIN"
  echo "  2. Choose Free plan"
  echo "  3. DNS records:"
  echo "       A    @      $ORIGIN_IP   (DNS only / grey cloud — required for Let's Encrypt on origin)"
  echo "       A    www    $ORIGIN_IP   (DNS only)"
  echo "  4. SSL/TLS → Full (strict)"
  echo "  5. At NameSilo: Domain → Change Nameservers → use Cloudflare NS"
  exit 1
fi

api() {
  local method="$1" path="$2"
  shift 2
  curl -sf -X "$method" "https://api.cloudflare.com/client/v4${path}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

echo "==> Creating Cloudflare zone for ${DOMAIN}..."
ZONE_JSON=$(api POST /zones -d "{\"name\":\"${DOMAIN}\",\"jump_start\":false,\"type\":\"full\"}")
ZONE_ID=$(echo "$ZONE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['id'] if d.get('success') else '')" 2>/dev/null || true)

if [[ -z "$ZONE_ID" ]]; then
  echo "Zone may already exist — looking up..."
  ZONE_ID=$(api GET "/zones?name=${DOMAIN}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'][0]['id'] if d.get('result') else '')")
fi

if [[ -z "$ZONE_ID" ]]; then
  echo "ERROR: Could not create or find zone. Response: $ZONE_JSON"
  exit 1
fi

echo "Zone ID: $ZONE_ID"

upsert_a() {
  local name="$1"
  local existing
  existing=$(api GET "/zones/${ZONE_ID}/dns_records?type=A&name=${name}" | python3 -c "import sys,json; r=json.load(sys.stdin).get('result',[]); print(r[0]['id'] if r else '')")
  if [[ -n "$existing" ]]; then
    api PUT "/zones/${ZONE_ID}/dns_records/${existing}" \
      -d "{\"type\":\"A\",\"name\":\"${name}\",\"content\":\"${ORIGIN_IP}\",\"ttl\":3600,\"proxied\":false}" >/dev/null
    echo "Updated A ${name} → ${ORIGIN_IP}"
  else
    api POST "/zones/${ZONE_ID}/dns_records" \
      -d "{\"type\":\"A\",\"name\":\"${name}\",\"content\":\"${ORIGIN_IP}\",\"ttl\":3600,\"proxied\":false}" >/dev/null
    echo "Created A ${name} → ${ORIGIN_IP}"
  fi
}

upsert_a "${DOMAIN}"
upsert_a "www.${DOMAIN}"

echo ""
echo "==> Set SSL mode to Full (strict) in Cloudflare dashboard (SSL/TLS)."
echo "==> Update nameservers at NameSilo to:"
api GET "/zones/${ZONE_ID}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for ns in d['result']['name_servers']:
    print('  ', ns)
"
echo ""
echo "Done. Propagation usually takes 5–30 minutes after NS change."
