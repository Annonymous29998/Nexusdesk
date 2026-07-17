import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  DEFAULT_ORGANIZATION_SETTINGS,
  ERROR_CODES,
  TOKEN_DEFAULTS,
} from '@nexusdesk/shared';
import { UserRole } from '@nexusdesk/types';
import {
  decryptAesGcmToString,
  emailSchema,
  encryptAesGcm,
  hashPassword,
  hashSecret,
  parseDuration,
  passwordSchema,
  slugSchema,
  verifyPassword,
} from '@nexusdesk/utils';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import { BruteForceGuard } from '../lib/brute-force.js';
import { sendMail } from '../lib/mailer.js';
import {
  buildTotpUri,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotp,
} from '../lib/totp.js';
import {
  createTokenPair,
  generateOpaqueToken,
  hashToken,
  verifyRefreshToken,
} from '../lib/tokens.js';
import {
  AuthSessionRepository,
  OrganizationRepository,
  RefreshTokenRepository,
  TokenStores,
  UserRepository,
} from '../repositories/index.js';
import { AuditService } from './audit.js';

export class AuthService {
  private readonly users: UserRepository;
  private readonly orgs: OrganizationRepository;
  private readonly sessions: AuthSessionRepository;
  private readonly refreshTokens: RefreshTokenRepository;
  private readonly tokens: TokenStores;
  private readonly bruteForce: BruteForceGuard;
  private readonly audit: AuditService;

  constructor(
    private readonly prisma: PrismaClient,
    redis: Redis | null,
  ) {
    this.users = new UserRepository(prisma);
    this.orgs = new OrganizationRepository(prisma);
    this.sessions = new AuthSessionRepository(prisma);
    this.refreshTokens = new RefreshTokenRepository(prisma);
    this.tokens = new TokenStores(prisma);
    this.bruteForce = new BruteForceGuard(redis);
    this.audit = new AuditService(prisma);
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    organizationName: string;
    organizationSlug: string;
  }) {
    const email = emailSchema.parse(input.email);
    const password = passwordSchema.parse(input.password);
    const slug = slugSchema.parse(input.organizationSlug);

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw AppError.conflict('Email already registered');
    }
    const slugTaken = await this.orgs.findBySlug(slug);
    if (slugTaken) {
      throw AppError.conflict('Organization slug already taken');
    }

    const hashed = hashPassword(password);
    const user = await this.users.create({
      email,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      displayName: input.displayName.trim(),
    });

    const org = await this.orgs.create({
      name: input.organizationName.trim(),
      slug,
      ownerUserId: user.id,
      settings: { ...DEFAULT_ORGANIZATION_SETTINGS },
    });

    await this.orgs.addMember(org.id, user.id, UserRole.Owner);

    const verifyToken = generateOpaqueToken();
    await this.tokens.createEmailVerification(
      user.id,
      hashToken(verifyToken),
      new Date(Date.now() + parseDuration('24h')),
    );

    const env = getEnv();
    await sendMail({
      to: email,
      subject: 'Verify your NexusDesk email',
      text: `Welcome to NexusDesk!\n\nVerify your email: ${env.APP_URL}/verify-email?token=${verifyToken}\n`,
    });

    await this.audit.record({
      organizationId: org.id,
      actorUserId: user.id,
      actorEmail: email,
      action: 'auth.register',
      resourceType: 'user',
      resourceId: user.id,
      after: { email, organizationId: org.id },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        organizationId: org.id,
        role: UserRole.Owner,
      },
      organization: { id: org.id, name: org.name, slug: org.slug },
      emailVerificationRequired: true,
    };
  }

  async login(input: {
    email: string;
    password: string;
    organizationSlug?: string;
    mfaCode?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const email = emailSchema.parse(input.email);
    await this.bruteForce.assertAllowed('login', email);

    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw AppError.unauthorized('Account temporarily locked', ERROR_CODES.USER_DISABLED);
    }

    const valid = verifyPassword(input.password, {
      hash: user.passwordHash,
      salt: user.passwordSalt,
      params: 'N=16384,r=8,p=1',
    });

    const env = getEnv();
    if (!valid) {
      const failed = user.failedLoginCount + 1;
      const update: Record<string, unknown> = { failedLoginCount: failed };
      if (failed >= env.LOCKOUT_MAX_ATTEMPTS) {
        update.lockedUntil = new Date(Date.now() + env.LOCKOUT_DURATION_MS);
        update.failedLoginCount = 0;
      }
      await this.users.update(user.id, update);
      throw AppError.unauthorized('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
    }

    let membership;
    if (input.organizationSlug) {
      const org = await this.orgs.findBySlug(input.organizationSlug);
      if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
      membership = await this.orgs.findMembership(org.id, user.id);
    } else {
      const members = await this.prisma.organizationMember.findMany({
        where: { userId: user.id },
        take: 1,
        orderBy: { joinedAt: 'asc' },
      });
      membership = members[0] ?? null;
    }

    if (!membership) {
      throw AppError.forbidden('No organization membership');
    }

    if (user.mfaEnabled) {
      if (!input.mfaCode) {
        return {
          requiresMfa: true as const,
          user: null,
          tokens: null,
        };
      }
      const secret = await this.tokens.getTwoFactor(user.id);
      if (!secret?.verifiedAt) {
        throw AppError.unauthorized('MFA not configured', ERROR_CODES.MFA_INVALID);
      }
      const plain = decryptAesGcmToString(secret.secretEnc, env.ENCRYPTION_KEY);
      const backupOk = secret.backupCodes.includes(hashSecret(input.mfaCode.toUpperCase()));
      const ok = verifyTotp(input.mfaCode, plain) || backupOk;
      if (!ok) {
        throw AppError.unauthorized('Invalid MFA code', ERROR_CODES.MFA_INVALID);
      }
    }

    await this.users.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: input.ip ?? null,
    });
    await this.bruteForce.reset('login', email);

    const session = await this.sessions.create({
      userId: user.id,
      organizationId: membership.organizationId,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ip ?? null,
      expiresAt: new Date(Date.now() + parseDuration(TOKEN_DEFAULTS.refreshTtl)),
    });

    const pair = createTokenPair({
      userId: user.id,
      organizationId: membership.organizationId,
      email: user.email,
      role: membership.role as UserRole,
      sessionId: session.id,
    });

    await this.refreshTokens.create({
      userId: user.id,
      sessionId: session.id,
      familyId: pair.familyId,
      tokenHash: hashToken(pair.refreshToken),
      expiresAt: new Date(pair.refreshExpiresAt),
    });

    await this.audit.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      actorEmail: user.email,
      actorIp: input.ip,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
    });

    return {
      requiresMfa: false as const,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: membership.role as UserRole,
        organizationId: membership.organizationId,
      },
      tokens: {
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        accessExpiresAt: pair.accessExpiresAt,
        refreshExpiresAt: pair.refreshExpiresAt,
        tokenType: 'Bearer' as const,
      },
    };
  }

  async refresh(refreshToken: string) {
    const claims = verifyRefreshToken(refreshToken);
    const stored = await this.refreshTokens.findByHash(hashToken(refreshToken));
    if (!stored || stored.revokedAt) {
      if (stored?.familyId) {
        await this.refreshTokens.revokeFamily(stored.familyId);
      }
      throw AppError.unauthorized('Refresh token revoked', ERROR_CODES.TOKEN_REVOKED);
    }
    if (stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token expired', ERROR_CODES.TOKEN_EXPIRED);
    }

    const user = await this.users.findById(claims.sub);
    if (!user || !user.isActive) {
      throw AppError.unauthorized('User disabled', ERROR_CODES.USER_DISABLED);
    }

    const membership = await this.orgs.findMembership(claims.org, user.id);
    if (!membership) {
      throw AppError.forbidden('No organization membership');
    }

    const session = await this.sessions.findById(stored.sessionId ?? '');
    if (!session || session.revokedAt) {
      throw AppError.unauthorized('Session revoked', ERROR_CODES.TOKEN_REVOKED);
    }

    const pair = createTokenPair({
      userId: user.id,
      organizationId: membership.organizationId,
      email: user.email,
      role: membership.role as UserRole,
      sessionId: session.id,
      familyId: claims.fam,
    });

    const created = await this.refreshTokens.create({
      userId: user.id,
      sessionId: session.id,
      familyId: claims.fam,
      tokenHash: hashToken(pair.refreshToken),
      expiresAt: new Date(pair.refreshExpiresAt),
    });
    await this.refreshTokens.revoke(stored.id, created.id);
    await this.sessions.touch(session.id);

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessExpiresAt: pair.accessExpiresAt,
      refreshExpiresAt: pair.refreshExpiresAt,
      tokenType: 'Bearer' as const,
    };
  }

  async logout(input: { refreshToken?: string; everywhere?: boolean; userId?: string }) {
    if (input.everywhere && input.userId) {
      await this.sessions.revokeAllForUser(input.userId);
      return { ok: true };
    }
    if (input.refreshToken) {
      const stored = await this.refreshTokens.findByHash(hashToken(input.refreshToken));
      if (stored) {
        await this.refreshTokens.revokeFamily(stored.familyId);
        if (stored.sessionId) {
          await this.sessions.revoke(stored.sessionId);
        }
      }
    }
    return { ok: true };
  }

  async verifyEmail(token: string) {
    const record = await this.tokens.findEmailVerification(hashToken(token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw AppError.badRequest('Invalid or expired verification token');
    }
    await this.users.update(record.userId, { emailVerifiedAt: new Date() });
    await this.tokens.markEmailVerificationUsed(record.id);
    return { ok: true };
  }

  async forgotPassword(emailRaw: string) {
    const email = emailSchema.parse(emailRaw);
    await this.bruteForce.assertAllowed('forgot', email);
    const user = await this.users.findByEmail(email);
    if (user) {
      const token = generateOpaqueToken();
      await this.tokens.createPasswordReset(
        user.id,
        hashToken(token),
        new Date(Date.now() + parseDuration('1h')),
      );
      const env = getEnv();
      await sendMail({
        to: email,
        subject: 'Reset your NexusDesk password',
        text: `Reset your password: ${env.APP_URL}/reset-password?token=${token}\n`,
      });
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const password = passwordSchema.parse(newPassword);
    const record = await this.tokens.findPasswordReset(hashToken(token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw AppError.badRequest('Invalid or expired reset token');
    }
    const hashed = hashPassword(password);
    await this.users.update(record.userId, {
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await this.tokens.markPasswordResetUsed(record.id);
    await this.sessions.revokeAllForUser(record.userId);
    return { ok: true };
  }

  async setupMfa(userId: string, email: string) {
    const env = getEnv();
    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes();
    const enc = encryptAesGcm(secret, env.ENCRYPTION_KEY);
    await this.tokens.upsertTwoFactor(userId, enc.ciphertext, backupCodes.map((c) => hashSecret(c)));
    return {
      secret,
      otpauthUrl: buildTotpUri(secret, email),
      backupCodes,
    };
  }

  async verifyMfa(userId: string, code: string) {
    const env = getEnv();
    const record = await this.tokens.getTwoFactor(userId);
    if (!record) throw AppError.badRequest('MFA setup required first', ERROR_CODES.MFA_INVALID);
    const secret = decryptAesGcmToString(record.secretEnc, env.ENCRYPTION_KEY);
    if (!verifyTotp(code, secret)) {
      throw AppError.unauthorized('Invalid MFA code', ERROR_CODES.MFA_INVALID);
    }
    await this.tokens.verifyTwoFactor(userId);
    await this.users.update(userId, { mfaEnabled: true });
    return { ok: true };
  }

  async disableMfa(userId: string, code: string) {
    const env = getEnv();
    const record = await this.tokens.getTwoFactor(userId);
    if (!record) return { ok: true };
    const secret = decryptAesGcmToString(record.secretEnc, env.ENCRYPTION_KEY);
    if (!verifyTotp(code, secret)) {
      throw AppError.unauthorized('Invalid MFA code', ERROR_CODES.MFA_INVALID);
    }
    await this.tokens.deleteTwoFactor(userId);
    await this.users.update(userId, { mfaEnabled: false });
    return { ok: true };
  }

  async me(userId: string, organizationId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);
    const membership = await this.orgs.findMembership(organizationId, userId);
    if (!membership) throw AppError.forbidden('Not a member');
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      mfaEnabled: user.mfaEnabled,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      role: membership.role,
      organizationId,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  listSessions(userId: string) {
    return this.sessions.listByUser(userId);
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw AppError.notFound('Session not found');
    }
    await this.sessions.revoke(sessionId);
    return { ok: true };
  }
}

export function createFamilyId(): string {
  return randomUUID();
}
