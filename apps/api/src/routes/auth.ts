import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { writeAuditLog } from '../security/audit.js';
import { demoStore } from '../data/demo-store.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/me', { schema: { tags: ['Auth'] } }, async (request) => {
    return {
      user: request.actor,
      sessionTimeoutMinutes: demoStore.settings.sessionTimeoutMinutes,
    };
  });

  app.post('/api/auth/login', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'InvalidCredentialsPayload' });
    }
    const user = demoStore.users.find(
      (u) => u.email.toLowerCase() === parsed.data.email.toLowerCase()
    );
    await writeAuditLog({
      actorUserId: user?.id ?? null,
      actorEmail: parsed.data.email,
      action: user ? 'AUTH_LOGIN_SUCCESS' : 'AUTH_LOGIN_FAILED',
      entityType: 'user',
      entityId: user?.id ?? parsed.data.email,
      ipAddress: request.ip,
    });
    if (!user) {
      return reply.status(401).send({ error: 'InvalidCredentials' });
    }
    return {
      mfaRequired: true,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  });

  app.post('/api/auth/reauth', { schema: { tags: ['Auth'] } }, async (request) => {
    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'AUTH_REAUTH_VERIFIED',
      entityType: 'session',
      entityId: request.actor.userId,
      ipAddress: request.ip,
    });
    return { ok: true, reauthenticatedAt: new Date().toISOString() };
  });
}
