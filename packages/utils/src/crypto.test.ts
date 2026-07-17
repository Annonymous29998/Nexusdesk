import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  randomAlphanumeric,
  randomToken,
  secureCompare,
  sha256,
  verifyPassword,
} from './crypto.js';
import {
  decryptAesGcmToString,
  encryptAesGcm,
  parseEncryptionKey,
} from './aes.js';
import { formatDuration, parseDuration } from './duration.js';
import { createRateLimit } from './rate-limit.js';
import { isOk, ok, err, unwrapOr } from './result.js';
import { isValidEmail, isValidUuid } from './validation.js';
import { isPrivateIpv4, normalizeIp } from './ip.js';

describe('crypto', () => {
  it('hashes and verifies passwords', () => {
    const hashed = hashPassword('CorrectHorseBatteryStaple!');
    expect(hashed.params).toContain('N=16384');
    expect(verifyPassword('CorrectHorseBatteryStaple!', hashed)).toBe(true);
    expect(verifyPassword('wrong', hashed)).toBe(false);
  });

  it('creates stable digests and tokens', () => {
    expect(sha256('nexusdesk')).toHaveLength(64);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomAlphanumeric(24)).toHaveLength(24);
    expect(secureCompare('abc', 'abc')).toBe(true);
    expect(secureCompare('abc', 'abd')).toBe(false);
  });
});

describe('aes-256-gcm', () => {
  it('round-trips encrypted payloads', () => {
    const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));
    const payload = encryptAesGcm('remote-session-secret', key);
    expect(decryptAesGcmToString(payload, key)).toBe('remote-session-secret');
  });
});

describe('duration + rate limit', () => {
  it('parses and formats durations', () => {
    expect(parseDuration('1h30m')).toBe(5_400_000);
    expect(formatDuration(5_400_000)).toContain('h');
  });

  it('enforces rate limits', () => {
    const check = createRateLimit({ windowMs: 60_000, limit: 2 });
    expect(check('user-1').allowed).toBe(true);
    expect(check('user-1').allowed).toBe(true);
    expect(check('user-1').allowed).toBe(false);
  });
});

describe('result + validation + ip', () => {
  it('supports result helpers', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(unwrapOr(err('x'), 42)).toBe(42);
  });

  it('validates emails and uuids', () => {
    expect(isValidEmail('ops@nexusdesk.io')).toBe(true);
    expect(isValidEmail('bad')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('normalizes and classifies IPs', () => {
    expect(normalizeIp('::ffff:10.0.0.5')).toBe('10.0.0.5');
    expect(isPrivateIpv4('10.0.0.5')).toBe(true);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
  });
});
