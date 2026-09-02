#!/bin/sh
# Production coturn (UDP/TCP 3478). TLS/TURNS is optional and omitted until
# certificates are mounted. Relays via the instance public IP.
set -eu

if [ -z "${TURN_SHARED_SECRET:-}" ]; then
  echo "TURN_SHARED_SECRET is required" >&2
  exit 1
fi

EXTERNAL_IP="${TURN_EXTERNAL_IP:-3.128.135.95}"
REALM="${TURN_REALM:-nesuxdesk.xyz}"
MIN_PORT="${TURN_MIN_PORT:-49160}"
MAX_PORT="${TURN_MAX_PORT:-49200}"

exec turnserver -n \
  --log-file=stdout \
  --listening-port=3478 \
  --listening-ip=0.0.0.0 \
  --relay-ip=0.0.0.0 \
  --external-ip="${EXTERNAL_IP}" \
  --min-port="${MIN_PORT}" \
  --max-port="${MAX_PORT}" \
  --fingerprint \
  --use-auth-secret \
  --static-auth-secret="${TURN_SHARED_SECRET}" \
  --realm="${REALM}" \
  --server-name="${REALM}" \
  --no-tls \
  --no-dtls \
  --no-cli \
  --no-multicast-peers \
  --no-rfc5780 \
  --stale-nonce=600 \
  --denied-peer-ip=0.0.0.0-0.255.255.255 \
  --denied-peer-ip=10.0.0.0-10.255.255.255 \
  --denied-peer-ip=100.64.0.0-100.127.255.255 \
  --denied-peer-ip=127.0.0.0-127.255.255.255 \
  --denied-peer-ip=169.254.0.0-169.254.255.255 \
  --denied-peer-ip=172.16.0.0-172.31.255.255 \
  --denied-peer-ip=192.168.0.0-192.168.255.255 \
  --total-quota=100
