#!/usr/bin/env bash
# Package the Windows guest agent zip served by GET /guest/:code/agent-package.zip
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAGING="$ROOT/.tmp/agent-windows-pack"
OUT_DIR="$ROOT/apps/agent/release"
OUT_ZIP="$OUT_DIR/agent-windows.zip"
NODE_VERSION="v22.14.0"
NODE_DIST="node-${NODE_VERSION}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}"
NODE_CACHE_DIR="$ROOT/.tmp"
NODE_CACHE_ZIP="$NODE_CACHE_DIR/${NODE_DIST}"

echo "==> Building shared packages + agent"
npm run build -w @nexusdesk/types
npm run build -w @nexusdesk/utils
npm run build -w @nexusdesk/shared
npm run build -w @nexusdesk/agent

rm -rf "$STAGING"
mkdir -p \
  "$STAGING/dist" \
  "$STAGING/vendor/types/dist" \
  "$STAGING/vendor/utils/dist" \
  "$STAGING/vendor/shared/dist" \
  "$STAGING/runtime" \
  "$OUT_DIR" \
  "$NODE_CACHE_DIR"

cp -R apps/agent/dist/. "$STAGING/dist/"
cp -R packages/types/dist/. "$STAGING/vendor/types/dist/"
cp -R packages/utils/dist/. "$STAGING/vendor/utils/dist/"
cp -R packages/shared/dist/. "$STAGING/vendor/shared/dist/"
cp packages/types/package.json "$STAGING/vendor/types/"
cp packages/utils/package.json "$STAGING/vendor/utils/"
cp packages/shared/package.json "$STAGING/vendor/shared/"

echo "==> Preparing bundled Windows Node runtime (${NODE_VERSION})"
if [ ! -f "$NODE_CACHE_ZIP" ]; then
  echo "Downloading ${NODE_DIST}..."
  curl -fL "$NODE_URL" -o "$NODE_CACHE_ZIP"
fi
rm -rf "$STAGING/runtime"
mkdir -p "$STAGING/runtime"
unzip -q "$NODE_CACHE_ZIP" -d "$STAGING/runtime"
mv "$STAGING/runtime/node-${NODE_VERSION}-win-x64" "$STAGING/runtime/node"

# Standalone package.json that points at vendored workspace packages
node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const agentPkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/agent/package.json'), 'utf8'));
const staging = path.join(root, '.tmp/agent-windows-pack');
const pkg = {
  name: 'nexusdesk-agent-windows',
  version: agentPkg.version,
  type: 'module',
  main: './dist/main.js',
  dependencies: {
    ...Object.fromEntries(
      Object.entries(agentPkg.dependencies || {}).filter(([k]) => !k.startsWith('@nexusdesk/'))
    ),
    '@nexusdesk/types': 'file:./vendor/types',
    '@nexusdesk/utils': 'file:./vendor/utils',
    '@nexusdesk/shared': 'file:./vendor/shared',
  },
};
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(pkg, null, 2));
NODE

echo "==> Installing production dependencies into package"
(
  cd "$STAGING"
  npm install --omit=dev --no-audit --no-fund
)

echo "==> Creating zip"
rm -f "$OUT_ZIP"
(
  cd "$STAGING"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "$OUT_ZIP" .
  else
    node -e "
      const { execSync } = require('child_process');
      // fallback: use npm pack style via bestzip if available, else tar.gz note
      console.error('zip CLI not found — install zip or run: brew install zip');
      process.exit(1);
    "
  fi
)

rm -rf "$STAGING"
echo "Wrote $OUT_ZIP"
ls -lh "$OUT_ZIP"
