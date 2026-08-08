#!/usr/bin/env bash
# Sign a Windows PE with Authenticode (osslsigncode).
# Requires a CA-issued code signing cert — self-signed will NOT clear SmartScreen.
set -euo pipefail

IN="${1:-}"
OUT="${2:-}"
if [[ -z "$IN" || -z "$OUT" ]]; then
  echo "Usage: $0 <input.exe> <output.exe>" >&2
  exit 2
fi

if ! command -v osslsigncode >/dev/null 2>&1; then
  echo "osslsigncode not found. Install: brew install osslsigncode" >&2
  exit 1
fi

CERT="${CODE_SIGN_CERT_PATH:-}"
KEY="${CODE_SIGN_KEY_PATH:-}"
PFX="${CODE_SIGN_PFX_PATH:-}"
PASS="${CODE_SIGN_PFX_PASSWORD:-}"
NAME="${CODE_SIGN_PRODUCT_NAME:-NexusDesk Setup}"
URL="${CODE_SIGN_PRODUCT_URL:-https://nexusdesk.app}"
TS="${CODE_SIGN_TIMESTAMP_URL:-http://timestamp.digicert.com}"

if [[ -n "$PFX" ]]; then
  if [[ ! -f "$PFX" ]]; then
    echo "CODE_SIGN_PFX_PATH not found: $PFX" >&2
    exit 1
  fi
  ARGS=(sign -pkcs12 "$PFX")
  if [[ -n "$PASS" ]]; then
    ARGS+=(-pass "$PASS")
  fi
elif [[ -n "$CERT" && -n "$KEY" ]]; then
  if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
    echo "CODE_SIGN_CERT_PATH / CODE_SIGN_KEY_PATH missing on disk" >&2
    exit 1
  fi
  ARGS=(sign -certs "$CERT" -key "$KEY")
else
  echo "Set CODE_SIGN_PFX_PATH or CODE_SIGN_CERT_PATH + CODE_SIGN_KEY_PATH" >&2
  exit 1
fi

ARGS+=(
  -n "$NAME"
  -i "$URL"
  -t "$TS"
  -h sha256
  -in "$IN"
  -out "$OUT"
)

osslsigncode "${ARGS[@]}"
echo "Signed $OUT"
