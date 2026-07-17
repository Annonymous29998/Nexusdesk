import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Cryptographically secure random bytes as a Buffer. */
export function randomBytesBuffer(size: number): Buffer {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('size must be a positive integer');
  }
  return randomBytes(size);
}

/** URL-safe random token (base64url). Default 32 bytes → 43 chars. */
export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/** Alphanumeric random token of exact character length. */
export function randomAlphanumeric(length = 32): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('length must be a positive integer');
  }
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length]!;
  }
  return out;
}

/** SHA-256 hex digest of a string or buffer. */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** SHA-512 hex digest. */
export function sha512(input: string | Buffer): string {
  return createHash('sha512').update(input).digest('hex');
}

/** HMAC-SHA256 hex digest. */
export function hmacSha256(secret: string | Buffer, input: string | Buffer): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

/** Constant-time string comparison for digests / tokens. */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface PasswordHash {
  hash: string;
  salt: string;
  /** scrypt params encoded as N,r,p */
  params: string;
}

/** Hash a password with scrypt (N=16384, r=8, p=1). */
export function hashPassword(password: string, salt?: string): PasswordHash {
  const saltBuf = salt ? Buffer.from(salt, 'base64url') : randomBytes(16);
  const derived = scryptSync(password, saltBuf, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return {
    hash: derived.toString('base64url'),
    salt: saltBuf.toString('base64url'),
    params: 'N=16384,r=8,p=1',
  };
}

/** Verify a password against a stored scrypt hash. */
export function verifyPassword(password: string, stored: PasswordHash): boolean {
  const attempt = hashPassword(password, stored.salt);
  return secureCompare(attempt.hash, stored.hash);
}

/** Hash an API key / invitation token for at-rest storage. */
export function hashSecret(secret: string, pepper?: string): string {
  const material = pepper ? `${pepper}:${secret}` : secret;
  return sha256(material);
}
