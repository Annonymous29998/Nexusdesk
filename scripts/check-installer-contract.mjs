#!/usr/bin/env node
/**
 * Installer contract check (Mac/Linux safe).
 * Creates guest links, downloads HTA, decodes embedded PowerShell, verifies
 * known bug regressions are gone. Does NOT run mshta (Windows-only).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const root = resolve(import.meta.dirname, '..');
loadEnvFile(resolve(root, 'apps/api/.env'));

const API = (process.env.API_URL || 'http://192.168.18.5:4000').replace(/\/$/, '');
const APP = (process.env.APP_URL || 'http://192.168.18.5:3000').replace(/\/$/, '');
const email = process.env.SEED_ADMIN_EMAIL || 'admin@nexusdesk.com';
const password = process.env.SEED_ADMIN_PASSWORD;

const fails = [];
const pass = (m) => console.log('PASS ', m);
const fail = (m) => {
  console.log('FAIL ', m);
  fails.push(m);
};

async function main() {
  if (!password) {
    fail('SEED_ADMIN_PASSWORD missing');
    process.exit(1);
  }

  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const login = await loginRes.json();
  const token = login.tokens?.accessToken;
  const orgId = login.user?.organizationId;
  if (!token || !orgId) {
    fail(`login failed: ${loginRes.status}`);
    process.exit(1);
  }
  pass('admin login');

  for (const inviteTemplate of ['zoom', 'google_meet']) {
    const createRes = await fetch(`${API}/organizations/${orgId}/guest-links`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteTemplate,
        maxUses: 5,
        ttl: 'never',
        label: `contract-${inviteTemplate}`,
      }),
    });
    const created = await createRes.json();
    const code = created.link?.code;
    if (!code) {
      fail(`create ${inviteTemplate}`);
      continue;
    }
    pass(`create ${inviteTemplate} ${code}`);

    const pub = await (await fetch(`${API}/guest/${code}`)).json();
    if (!String(pub.windowsInstallerUrl || '').includes('v=23')) {
      fail(`${inviteTemplate} not v=23 (${pub.windowsInstallerUrl})`);
    } else pass(`${inviteTemplate} installer v=23`);

    const htaRes = await fetch(`${API}/guest/${code}/setup.hta?v=23`);
    const hta = await htaRes.text();
    if (htaRes.status !== 200 || hta.length < 1000) {
      fail(`${inviteTemplate} HTA download`);
      continue;
    }
    pass(`${inviteTemplate} HTA ${hta.length}b`);

    const htaChecks = [
      ['download can hit 100%', /DOWNLOAD_LABEL \+ " 100%"/.test(hta)],
      ['no mshta self-elevate', !/ShellExecute\("mshta\.exe"/.test(hta)],
      ['hidden runas cmd', /ShellExecute\("cmd\.exe"[^)]*"runas", 0\)/.test(hta)],
      ['progress polling', /readProgressStatus/.test(hta)],
      ['no unicode ellipsis', !/\u2026/.test(hta)],
      ['Continue -> startInstall', /btn\.onclick = startInstall/.test(hta)],
      ['no fake 94% install cap', !/pct < 94/.test(hta)],
      // Old download bug was Math.min(99, size/total) style — ensure download path uses 100
      ['download pct not capped 99', !/Math\.min\(\s*99\s*,\s*\(size/.test(hta)],
    ];
    for (const [name, ok] of htaChecks) (ok ? pass : fail)(`${inviteTemplate} HTA: ${name}`);

    const chunkMatch = hta.match(/var CHUNKS = \[([\s\S]*?)\];/);
    if (!chunkMatch) fail(`${inviteTemplate} CHUNKS missing`);
    else {
      const chunkStrs = [...chunkMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) =>
        JSON.parse(`"${m[1]}"`),
      );
      const ps = Buffer.from(chunkStrs.join(''), 'base64').toString('utf16le');
      const psChecks = [
        ['Clear-InstallDir', ps.includes('Clear-InstallDir')],
        ['app-staging extract', ps.includes('app-staging') && ps.includes('$stagingDir')],
        ['progress markers', ps.includes('Write-ProgressStatus')],
        ['complete + failed markers', ps.includes('setup-complete-') && ps.includes('setup-failed-')],
        ['stop old NexusDesk node', ps.includes('NexusDesk') && ps.includes('Stop-Process')],
        // Dual Start-Process + immediate task start caused agent WS fights / blank viewer.
        ['single immediate agent launch', ps.includes('Start-Process') && !/Start-ScheduledTask\s+-TaskName/.test(ps)],
        ['register logon task', ps.includes('Register-ScheduledTask')],
      ];
      for (const [name, ok] of psChecks) (ok ? pass : fail)(`${inviteTemplate} PS: ${name}`);
    }

    const head = await fetch(`${API}/guest/${code}/agent-package.zip`, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') || 0);
    if (head.ok && len > 1_000_000) pass(`${inviteTemplate} package ${len}b`);
    else fail(`${inviteTemplate} package HEAD`);

    const joinPath =
      inviteTemplate === 'google_meet' ? `/gotme/GoogleMeet/${code}` : `/joinzoom/${code}`;
    const joinStatus = (await fetch(`${APP}${joinPath}`)).status;
    if (joinStatus === 200) pass(`${inviteTemplate} join page`);
    else fail(`${inviteTemplate} join page ${joinStatus}`);
  }

  // Note Windows limitation
  const isWin = process.platform === 'win32';
  if (!isWin) {
    console.log(
      'NOTE  Full mshta install+enroll e2e requires Windows (GitHub Actions windows-latest or a Windows PC).',
    );
  }

  console.log(
    fails.length
      ? `\n==> CONTRACT CHECKS FAILED (${fails.length})`
      : '\n==> CONTRACT CHECKS PASSED',
  );
  for (const f of fails) console.log(' -', f);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
