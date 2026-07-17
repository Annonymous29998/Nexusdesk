import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDataDir } from '../config.js';
import { createLogger } from '../logger.js';

const log = createLogger('service');

export function writeSystemdUnit(execPath: string): string {
  const unit = `[Unit]
Description=NexusDesk Remote Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execPath}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;
  const path = join(ensureDataDir(), 'nexusdesk-agent.service');
  writeFileSync(path, unit, { mode: 0o644 });
  log.info({ path }, 'wrote systemd unit');
  return path;
}

export function writeLaunchdPlist(execPath: string): string {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.nexusdesk.agent</string>
  <key>ProgramArguments</key>
  <array><string>${execPath}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`;
  const path = join(ensureDataDir(), 'com.nexusdesk.agent.plist');
  writeFileSync(path, plist, { mode: 0o644 });
  log.info({ path }, 'wrote launchd plist');
  return path;
}
