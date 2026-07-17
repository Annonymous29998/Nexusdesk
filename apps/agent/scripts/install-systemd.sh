#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_SRC="$ROOT/scripts/nexusdesk-agent.service"
EXEC="$(command -v nexusdesk-agent || echo "$ROOT/dist/main.js")"
sudo tee /etc/systemd/system/nexusdesk-agent.service >/dev/null <<EOF
[Unit]
Description=NexusDesk Remote Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node $EXEC
Restart=always
RestartSec=5
EnvironmentFile=-/etc/nexusdesk/agent.env

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now nexusdesk-agent.service
echo "NexusDesk agent installed via systemd"
