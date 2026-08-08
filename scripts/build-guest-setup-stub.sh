#!/usr/bin/env bash
# Cross-compile the Windows guest setup stub EXE used by GET /guest/:code/setup.exe
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/api/assets/guest-setup-stub.exe"
mkdir -p "$(dirname "$OUT")"
cd "$ROOT/tools/guest-setup-stub"
if [[ ! -f go.mod ]]; then
  go mod init nexusdesk/guest-setup-stub
fi
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w -H windowsgui" -o "$OUT" .
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
if [[ -n "${CODE_SIGN_PFX_PATH:-}${CODE_SIGN_CERT_PATH:-}" ]]; then
  echo "Note: per-guest EXEs are signed at download time by the API (see docs/CODE_SIGNING.md)."
fi
