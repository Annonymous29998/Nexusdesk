import { describe, expect, it } from 'vitest';
import { DeviceStatus } from '@nexusdesk/types';
import { listDevices } from '@/api/devices';
import { setDemoMode } from '@/api/client';

describe('devices api demo fallback', () => {
  it('lists devices in demo mode', async () => {
    setDemoMode(true);
    const page = await listDevices({ orgId: 'org_demo_acme', status: DeviceStatus.Online });
    expect(page.items.every((d) => d.status === DeviceStatus.Online)).toBe(true);
    expect(page.total).toBeGreaterThan(0);
  });
});
