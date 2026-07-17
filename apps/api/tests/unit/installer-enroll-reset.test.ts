import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/env.js')>(
    '../../src/config/env.js',
  );
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      API_URL: 'http://192.168.18.5:4000',
      APP_URL: 'http://192.168.18.5:3000',
      WS_URL: 'ws://192.168.18.5:4000',
    }),
  };
});

describe('Windows installer enrollment reset', () => {
  it('bat launcher downloads setup.ps1 and keeps the window open', async () => {
    const { GuestAccessService } = await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const bat = service.buildWindowsBatchLauncher('FF9A496P', 'http://192.168.18.5:4000');

    expect(bat).toContain('ND_KEEPOPEN');
    expect(bat).toContain('cmd /k call');
    expect(bat).toContain('[1/2] Downloading package');
    expect(bat).toContain('windows.ps1?v=14');
    expect(bat).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File');
    expect(bat).not.toContain('setup.b64');
  });

  it('setup script clears stale state.json before starting the agent', async () => {
    const { GuestAccessService } = await import('../../src/services/guest-access.js');
    const service = new GuestAccessService({} as never);
    const script = service.buildWindowsInstallerScript('FF9A496P', 'http://192.168.18.5:4000');

    expect(script).toContain("Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'state.json')");
    expect(script).toContain("Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $DataDir 'tokens.enc')");
    expect(script).toContain('Start-Process -FilePath $nodeExe');
    expect(script).toContain('if ($st.deviceId)');
    expect(script).toContain('Enrollment failed');
  });
});
