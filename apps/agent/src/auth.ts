import { generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decryptAesGcmToString,
  encryptAesGcm,
  parseEncryptionKey,
  randomBytesBuffer,
} from '@nexusdesk/utils';
import { ensureDataDir } from './config.js';

export interface AgentTokens {
  deviceToken: string;
  refreshToken: string;
  /** ISO timestamp; informational only — the server is the source of truth for expiry. */
  issuedAt: string;
}

function machineKeyPath(): string {
  return join(ensureDataDir(), 'machine.key');
}

function tokensFilePath(): string {
  return join(ensureDataDir(), 'tokens.enc');
}

/**
 * Resolve the AES-256-GCM key used to encrypt tokens at rest.
 *
 * Preference order:
 *   1. `ENCRYPTION_KEY` env var (base64, 32 bytes) — shared across a fleet.
 *   2. A per-machine key file generated on first run and stored with 0600
 *      permissions. This still protects tokens from other local users / at
 *      rest on disk, without requiring central key distribution.
 */
export function resolveEncryptionKey(envKey: string | undefined): Buffer {
  if (envKey && envKey.trim().length > 0) {
    return parseEncryptionKey(envKey.trim());
  }

  const path = machineKeyPath();
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim();
    return parseEncryptionKey(raw);
  }

  const key = randomBytesBuffer(32);
  writeFileSync(path, key.toString('base64'), { mode: 0o600 });
  return key;
}

export class AgentAuthStore {
  private readonly key: Buffer;

  constructor(envKey: string | undefined) {
    this.key = resolveEncryptionKey(envKey);
  }

  save(tokens: AgentTokens): void {
    const payload = encryptAesGcm(JSON.stringify(tokens), this.key, 'v1');
    writeFileSync(tokensFilePath(), JSON.stringify(payload), { mode: 0o600 });
  }

  load(): AgentTokens | null {
    const path = tokensFilePath();
    if (!existsSync(path)) return null;

    try {
      const raw = readFileSync(path, 'utf8');
      const payload = JSON.parse(raw) as { ciphertext: string; kid?: string };
      const json = decryptAesGcmToString(payload, this.key);
      return JSON.parse(json) as AgentTokens;
    } catch {
      // Corrupt or key-mismatched token store; treat as unauthenticated so the
      // agent falls back to re-enrollment rather than crash-looping.
      return null;
    }
  }

  clear(): void {
    const path = tokensFilePath();
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        writeFileSync(path, '', { mode: 0o600 });
      }
    }
  }
}

export interface DeviceKeyPair {
  publicKeyBase64: string;
  privateKeyPem: string;
}

function deviceKeyPath(): string {
  return join(ensureDataDir(), 'device-key.enc');
}

/**
 * Load the persisted device Ed25519 keypair, generating and encrypting a new
 * one on first run. The public key is sent during enrollment (see enroll.ts)
 * so the control plane can bind commands/updates to this specific device.
 */
export function getOrCreateDeviceKeyPair(key: Buffer): DeviceKeyPair {
  const path = deviceKeyPath();

  if (existsSync(path)) {
    try {
      const raw = readFileSync(path, 'utf8');
      const payload = JSON.parse(raw) as { ciphertext: string; kid?: string };
      const json = decryptAesGcmToString(payload, key);
      return JSON.parse(json) as DeviceKeyPair;
    } catch {
      // Fall through and regenerate if the stored keypair is unreadable.
    }
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyPair: DeviceKeyPair = {
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };

  const payload = encryptAesGcm(JSON.stringify(keyPair), key, 'v1');
  writeFileSync(path, JSON.stringify(payload), { mode: 0o600 });
  return keyPair;
}

/** Decode a JWT payload without verifying the signature (server is trusted over TLS). */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payloadSegment = parts[1];
    if (!payloadSegment) return null;
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** True if a JWT's `exp` claim is within `graceMs` of now (or already past). */
export function isJwtExpiringSoon(token: string, graceMs = 60_000): boolean {
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - Date.now() < graceMs;
}
