import type { FastifyInstance } from 'fastify';
import { updateSystemSettingsSchema } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { requirePermission } from '../security/auth-plugin.js';
import { writeAuditLog } from '../security/audit.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/settings', { schema: { tags: ['Admin'] } }, async () => ({
    settings: demoStore.settings,
  }));

  app.patch(
    '/api/admin/settings',
    {
      preHandler: [requirePermission('settings:manage')],
      schema: { tags: ['Admin'] },
    },
    async (request, reply) => {
      const parsed = updateSystemSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'ValidationError', details: parsed.error.flatten() });
      }
      const before = { ...demoStore.settings };
      Object.assign(demoStore.settings, parsed.data);

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'SYSTEM_SETTINGS_UPDATED',
        entityType: 'system_settings',
        entityId: 'default',
        ipAddress: request.ip,
        beforeValues: before as unknown as Record<string, unknown>,
        afterValues: demoStore.settings as unknown as Record<string, unknown>,
      });

      return { settings: demoStore.settings };
    }
  );

  app.get(
    '/api/admin/users',
    {
      preHandler: [requirePermission('users:manage')],
      schema: { tags: ['Admin'] },
    },
    async () => ({ users: demoStore.users })
  );

  app.get(
    '/api/admin/audit-logs',
    {
      preHandler: [requirePermission('audit_log:view')],
      schema: { tags: ['Admin'] },
    },
    async () => ({ auditLogs: demoStore.auditLogs })
  );
}
