import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { AuthService } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { getEnv } from '../config/env.js';

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(120),
  organizationSlug: z.string().min(2).max(64),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  organizationSlug: z.string().optional(),
  mfaCode: z.string().optional(),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const auth = () => new AuthService(app.prisma, app.redis);
  const env = getEnv();

  app.post('/auth/register', async (req) => {
    const body = registerBody.parse(req.body);
    return auth().register(body);
  });

  app.post(API_ROUTES.auth.login, {
    config: { rateLimit: { max: env.RATE_LIMIT_AUTH_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS } },
  }, async (req, reply) => {
    const body = loginBody.parse(req.body);
    const result = await auth().login({
      ...body,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if ('requiresMfa' in result && result.requiresMfa && !('tokens' in result)) {
      return reply.status(200).send(result);
    }
    return result;
  });

  app.post(API_ROUTES.auth.refresh, async (req) => {
    const body = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    return auth().refresh(body.refreshToken);
  });

  app.post(API_ROUTES.auth.logout, { preHandler: [requireAuth] }, async (req) => {
    const body = z.object({
      refreshToken: z.string().optional(),
      everywhere: z.boolean().optional(),
    }).parse(req.body ?? {});
    return auth().logout({ ...body, userId: req.authUser!.sub });
  });

  app.get(API_ROUTES.auth.me, { preHandler: [requireAuth] }, async (req) => {
    return auth().me(req.authUser!.sub, req.authUser!.org);
  });

  app.post(API_ROUTES.auth.forgotPassword, {
    config: { rateLimit: { max: env.RATE_LIMIT_AUTH_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS } },
  }, async (req) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    return auth().forgotPassword(body.email);
  });

  app.post(API_ROUTES.auth.resetPassword, async (req) => {
    const body = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body);
    return auth().resetPassword(body.token, body.password);
  });

  app.post(API_ROUTES.auth.verifyEmail, async (req) => {
    const body = z.object({ token: z.string() }).parse(req.body);
    return auth().verifyEmail(body.token);
  });

  app.post(API_ROUTES.auth.mfaSetup, { preHandler: [requireAuth] }, async (req) => {
    return auth().setupMfa(req.authUser!.sub, req.authUser!.email);
  });

  app.post(API_ROUTES.auth.mfaVerify, { preHandler: [requireAuth] }, async (req) => {
    const body = z.object({ code: z.string().min(6) }).parse(req.body);
    return auth().verifyMfa(req.authUser!.sub, body.code);
  });

  app.get('/auth/sessions', { preHandler: [requireAuth] }, async (req) => {
    return auth().listSessions(req.authUser!.sub);
  });

  app.delete('/auth/sessions/:sessionId', { preHandler: [requireAuth] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    return auth().revokeSession(req.authUser!.sub, sessionId);
  });
}
