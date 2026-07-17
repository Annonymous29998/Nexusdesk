import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@nexusdesk/utils';
import { loadEnv } from '../src/config/env.js';
import {
  createAccessToken,
  createTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/lib/tokens.js';
import { PermissionAction, PermissionResource, UserRole } from '@nexusdesk/types';
import { checkPermission } from '../src/middleware/rbac.js';

beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://nexusdesk:nexusdesk@localhost:5432/nexusdesk';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-min-32-characters-long!!';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-min-32-characters-long!';
  process.env.SESSION_SECRET ??= 'test-session-secret-min-32-characters-long!';
  process.env.ENCRYPTION_KEY ??= 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  process.env.AGENT_ENROLLMENT_SECRET ??= 'test-agent-enrollment-secret!!';
  process.env.INTERNAL_API_TOKEN ??= 'test-internal-api-token-min-32-chars!';
  loadEnv();
});

describe('password hashing', () => {
  it('hashes and verifies passwords', () => {
    const hashed = hashPassword('Admin123!');
    expect(hashed.hash).toBeTruthy();
    expect(hashed.salt).toBeTruthy();
    expect(verifyPassword('Admin123!', hashed)).toBe(true);
    expect(verifyPassword('wrong', hashed)).toBe(false);
  });
});

describe('jwt tokens', () => {
  it('creates and verifies access tokens', () => {
    const { token, claims } = createAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      email: 'admin@nexusdesk.local',
      role: UserRole.Owner,
    });
    const verified = verifyAccessToken(token);
    expect(verified.sub).toBe(claims.sub);
    expect(verified.email).toBe('admin@nexusdesk.local');
  });

  it('rotates refresh token families', () => {
    const pair = createTokenPair({
      userId: '11111111-1111-1111-1111-111111111111',
      organizationId: '22222222-2222-2222-2222-222222222222',
      email: 'admin@nexusdesk.local',
      role: UserRole.Admin,
    });
    const refresh = verifyRefreshToken(pair.refreshToken);
    expect(refresh.fam).toBe(pair.familyId);
    expect(refresh.typ).toBe('refresh');
  });
});

describe('rbac', () => {
  it('grants owner manage permissions', () => {
    expect(
      checkPermission(UserRole.Owner, PermissionResource.Device, PermissionAction.Control),
    ).toBe(true);
    expect(
      checkPermission(UserRole.Viewer, PermissionResource.Device, PermissionAction.Control),
    ).toBe(false);
  });
});
