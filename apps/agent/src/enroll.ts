import { DevicePlatform } from '@nexusdesk/types';

export interface EnrollInput {
  apiUrl: string;
  enrollmentToken?: string;
  guestCode?: string;
  hostname: string;
  platform: DevicePlatform;
  osVersion: string;
  agentVersion: string;
  publicKey: string;
  organizationId?: string;
  organizationSlug?: string;
  metadata?: Record<string, string>;
}

export interface EnrollResult {
  deviceId: string;
  organizationId: string;
  deviceToken: string;
  refreshToken: string;
  heartbeatIntervalMs: number;
  wsUrl: string;
}

export async function enrollDevice(input: EnrollInput): Promise<EnrollResult> {
  const response = await fetch(`${input.apiUrl.replace(/\/$/, '')}/devices/enroll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      enrollmentToken: input.enrollmentToken,
      guestCode: input.guestCode,
      hostname: input.hostname,
      platform: input.platform,
      osVersion: input.osVersion,
      agentVersion: input.agentVersion,
      publicKey: input.publicKey,
      organizationId: input.organizationId,
      organizationSlug: input.organizationSlug,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Enrollment failed (${response.status}): ${text}`);
  }

  return (await response.json()) as EnrollResult;
}
