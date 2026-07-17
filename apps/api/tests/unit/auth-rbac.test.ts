import { describe, expect, it, beforeAll } from 'vitest';
import { UserRole } from '@nexusdesk/types';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import { hashPassword, verifyPassword } from '@nexusdesk/utils';
import { checkPermission } from '../../src/middleware/rbac.js';
import { generateTotpSecret, verifyTotp } from '../../src/lib/totp.js';
import { authenticator } from 'otplib';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://nexusdesk:nexusdesk@localhost:5432/nexusdesk?schema=public';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters!!';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters!';
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ?? 'test-session-secret-min-32-characters!!';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  process.env.AGENT_ENROLLMENT_SECRET =
    process.env.AGENT_ENROLLMENT_SECRET ?? 'test-agent-enrollment-secret!!';
  process.env.INTERNAL_API_TOKEN =
    process.env.INTERNAL_API_TOKEN ?? 'test-internal-api-token-min-32-chars!';
});

describe('password hashing', () => {
  it('hashes and verifies passwords', () => {
    const stored = hashPassword('ChangeMe123!');
    expect(stored.hash).toBeTruthy();
    expect(stored.salt).toBeTruthy();
    expect(verifyPassword('ChangeMe123!', stored)).toBe(true);
    expect(verifyPassword('wrong-password', stored)).toBe(false);
  });
});

describe('RBAC', () => {
  it('grants owner full manage on organization', () => {
    expect(
      checkPermission(UserRole.Owner, PermissionResource.Organization, PermissionAction.Manage),
    ).toBe(true);
  });

  it('allows operator to create sessions but not manage api keys', () => {
    expect(
      checkPermission(UserRole.Operator, PermissionResource.Session, PermissionAction.Create),
    ).toBe(true);
    expect(
      checkPermission(UserRole.Operator, PermissionResource.ApiKey, PermissionAction.Create),
    ).toBe(false);
  });

  it('restricts viewer from control actions', () => {
    expect(
      checkPermission(UserRole.Viewer, PermissionResource.Device, PermissionAction.Control),
    ).toBe(false);
    expect(
      checkPermission(UserRole.Viewer, PermissionResource.Device, PermissionAction.Read),
    ).toBe(true);
  });
});

describe('TOTP helpers', () => {
  it('generates a secret and verifies a current code', () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(code, secret)).toBe(true);
    expect(verifyTotp('000000', secret)).toBe(false);
  });
});
