import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth.js';
import { registerHealthRoutes } from './health.js';
import { registerOrgRoutes } from './organizations.js';
import { registerUserRoutes } from './users.js';
import { registerInvitationRoutes } from './invitations.js';
import { registerDeviceRoutes } from './devices.js';
import { registerSessionRoutes } from './sessions.js';
import { registerApiKeyRoutes } from './api-keys.js';
import { registerNotificationRoutes } from './notifications.js';
import { registerAuditRoutes } from './audit.js';

import { registerGuestAccessRoutes } from './guest-access.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerOrgRoutes(app);
  await registerUserRoutes(app);
  await registerInvitationRoutes(app);
  await registerGuestAccessRoutes(app);
  await registerDeviceRoutes(app);
  await registerSessionRoutes(app);
  await registerApiKeyRoutes(app);
  await registerNotificationRoutes(app);
  await registerAuditRoutes(app);
}
