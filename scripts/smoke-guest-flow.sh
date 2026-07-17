#!/usr/bin/env bash
# Smoke / regression checks for the guest install → enroll → devices path.
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:4000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; FAIL=1; }

echo "==> NexusDesk smoke (API=$API_URL)"

# 1) API health
HEALTH="$(curl -fsS "$API_URL/health" || true)"
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  pass "GET /health"
else
  fail "GET /health → $HEALTH"
fi

# 2) Agent package present and contains mouse + version
ZIP="$ROOT/apps/agent/release/agent-windows.zip"
if [[ -f "$ZIP" ]]; then
  pass "agent-windows.zip exists ($(du -h "$ZIP" | awk '{print $1}'))"
else
  fail "missing $ZIP — run npm run pack:agent"
fi

if unzip -p "$ZIP" dist/config.js 2>/dev/null | grep -q "0.1.4"; then
  pass "agent package version is 0.1.4"
else
  fail "agent package is not 0.1.4"
fi

if unzip -l "$ZIP" 2>/dev/null | command grep 'koffi.node' | command grep -q 'win32_x64'; then
  pass "koffi win32_x64 binary packaged"
else
  fail "koffi win32 binary missing from package"
fi

# 3) Invalid guest code rejected
CODE_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/guest/NOTREAL1" || true)"
if [[ "$CODE_STATUS" == "401" || "$CODE_STATUS" == "404" || "$CODE_STATUS" == "400" ]]; then
  pass "invalid guest code rejected ($CODE_STATUS)"
else
  fail "invalid guest code unexpected status $CODE_STATUS"
fi

# 4) Installer source clears stale enrollment (unit regression via node)
cd "$ROOT"
if npm run test -w @nexusdesk/api -- tests/unit/installer-enroll-reset.test.ts >/tmp/nd-installer-test.out 2>&1; then
  pass "installer clears state.json (unit)"
else
  fail "installer unit test failed — see /tmp/nd-installer-test.out"
  tail -40 /tmp/nd-installer-test.out || true
fi

if npm run test -w @nexusdesk/agent -- src/config.test.ts >/tmp/nd-agent-reenroll.out 2>&1; then
  pass "agent shouldReenroll (unit)"
else
  fail "agent reenroll unit test failed — see /tmp/nd-agent-reenroll.out"
  tail -40 /tmp/nd-agent-reenroll.out || true
fi

# 5) Socket leave-safety: source contains identity check
if grep -q "current === client" "$ROOT/apps/api/src/sockets/index.ts"; then
  pass "agent reconnect leave() is identity-safe"
else
  fail "agent reconnect leave() bug may still be present"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "==> SMOKE FAILED"
  exit 1
fi

echo "==> SMOKE PASSED"
