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
# Embed publisher name, version, icon, and manifest so Windows shows a normal app — not a blank EXE.
GOVERSIONINFO="$(go env GOPATH)/bin/goversioninfo"
if [[ -x "$GOVERSIONINFO" ]]; then
  "$GOVERSIONINFO" -64=true -o resource.syso
elif command -v goversioninfo >/dev/null 2>&1; then
  goversioninfo -64=true -o resource.syso
else
  echo "warn: goversioninfo not installed; stub will lack version info (run: go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest)" >&2
fi
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w -H windowsgui" -o "$OUT" .
rm -f resource.syso
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
if [[ -n "${CODE_SIGN_PFX_PATH:-}${CODE_SIGN_CERT_PATH:-}" ]]; then
  echo "Note: per-guest EXEs are signed at download time by the API (see docs/CODE_SIGNING.md)."
fi
