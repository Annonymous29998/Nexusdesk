import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', async () => {
  const actual = await vi.importActual('../../src/config/env.js');
  return {
    ...actual,
    getEnv: () => ({
      ...(actual as { getEnv: () => Record<string, unknown> }).getEnv(),
      API_URL: 'http://192.168.18.5:4000',
      APP_URL: 'http://192.168.18.5:3000',
      WS_URL: 'ws://192.168.18.5:4000',
    }),
  };
});

describe('Windows installer enrollment reset', () => {
  it('bat launcher downloads setup.ps1 and keeps the window open', async () => {
    const { GuestAccessService, GUEST_INSTALLER_CACHE_BUST } =
      await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const bat = service.buildWindowsBatchLauncher('FF9A496P', 'http://192.168.18.5:4000');

    expect(bat).toContain('ND_KEEPOPEN');
    expect(bat).toContain('cmd /k call');
    expect(bat).toContain('[1/2] Downloading package');
    expect(bat).toContain(`windows.ps1?v=${GUEST_INSTALLER_CACHE_BUST}`);
    expect(bat).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File');
    expect(bat).not.toContain('setup.b64');
  });

  it('vbs launcher shows please-wait then launches the GUI setup.exe', async () => {
    const { GuestAccessService, GUEST_INSTALLER_CACHE_BUST } =
      await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const vbs = service.buildWindowsVbsLauncher('FF9A496P', 'http://192.168.18.5:4000', 'zoom');

    expect(vbs).toContain('Please wait.');
    expect(vbs).toContain('setup.exe');
    expect(vbs).toContain('curl.exe');
    expect(vbs).toContain('sh.Run("cmd /c " & cmd, 0, True)');
    expect(vbs).toContain('app.ShellExecute setupExe');
    expect(vbs).not.toContain('powershellw.exe');
    expect(vbs).not.toContain('Invoke-AgentInstall');
    expect(vbs).not.toContain('ExecutionPolicy Bypass');
    expect(vbs).not.toContain('Invoke-WebRequest');
    expect(vbs).not.toContain('wscript.exe');
    expect(vbs).not.toContain('net session');
    expect(vbs).toContain(`v=${GUEST_INSTALLER_CACHE_BUST}`);
  });

  it('exe launcher downloads the agent zip from the direct API host', async () => {
    const { GuestAccessService } = await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const exe = service.buildWindowsExeLauncher(
      'FF9A496P',
      'https://www.nesuxdesk.xyz/api',
      Buffer.from('MZ'),
      'zoom',
    );
    const text = exe.toString('utf8');
    expect(text).toContain('"apiUrl":"https://api.nesuxdesk.xyz"');
    expect(text).not.toContain('"apiUrl":"https://www.nesuxdesk.xyz/api"');
  });

  it('setup script clears stale state.json before starting the agent', async () => {
    const { GuestAccessService } = await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const script = service.buildWindowsInstallerScript('FF9A496P', 'http://192.168.18.5:4000');

    expect(script).toContain(
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'state.json')",
    );
    expect(script).toContain(
      "Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'tokens.enc')",
    );
    expect(script).toContain('Start-Process -FilePath $nodeExe');
    expect(script).toContain('if ($st.deviceId)');
    expect(script).toContain('Enrollment failed');
  });
});
