import { authenticator } from 'otplib';
import { randomAlphanumeric } from '@nexusdesk/utils';

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildTotpUri(secret: string, email: string, issuer = 'NexusDesk'): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  return authenticator.check(token, secret);
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomAlphanumeric(10));
}
