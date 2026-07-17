import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptedPayload {
  /** base64url: iv + ciphertext + authTag */
  ciphertext: string;
  /** Optional key version for rotation */
  kid?: string;
}

function normalizeKey(key: string | Buffer): Buffer {
  if (Buffer.isBuffer(key)) {
    if (key.length !== KEY_LENGTH) {
      throw new Error(`AES-256-GCM key must be ${KEY_LENGTH} bytes`);
    }
    return key;
  }

  // Prefer base64 / base64url; fall back to utf8 only if exact length
  try {
    const decoded = Buffer.from(key, 'base64');
    if (decoded.length === KEY_LENGTH) {
      return decoded;
    }
  } catch {
    // continue
  }

  const utf8 = Buffer.from(key, 'utf8');
  if (utf8.length === KEY_LENGTH) {
    return utf8;
  }

  throw new Error(
    `ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got base64 length or utf8 length mismatch)`,
  );
}

/** Encrypt plaintext with AES-256-GCM. Returns a single base64url blob. */
export function encryptAesGcm(
  plaintext: string | Buffer,
  key: string | Buffer,
  kid?: string,
): EncryptedPayload {
  const keyBuf = normalizeKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });
  const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, encrypted, tag]);
  return {
    ciphertext: packed.toString('base64url'),
    ...(kid !== undefined ? { kid } : {}),
  };
}

/** Decrypt a payload produced by encryptAesGcm. */
export function decryptAesGcm(payload: EncryptedPayload | string, key: string | Buffer): Buffer {
  const keyBuf = normalizeKey(key);
  const ciphertext = typeof payload === 'string' ? payload : payload.ciphertext;
  const packed = Buffer.from(ciphertext, 'base64url');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('ciphertext too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/** Decrypt and return UTF-8 string. */
export function decryptAesGcmToString(
  payload: EncryptedPayload | string,
  key: string | Buffer,
): string {
  return decryptAesGcm(payload, key).toString('utf8');
}

/** Parse ENCRYPTION_KEY from env (base64). */
export function parseEncryptionKey(raw: string): Buffer {
  return normalizeKey(raw);
}
