import { getDb, isDatabaseConfigured, isDemoMode } from '../db/client.js';
import { auditLogs } from '../db/schema/index.js';
import { demoStore } from '../data/demo-store.js';

export interface AuditEntryInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  homeId?: string | null;
  ipAddress?: string | null;
  beforeValues?: Record<string, unknown> | null;
  afterValues?: Record<string, unknown> | null;
}

export async function writeAuditLog(entry: AuditEntryInput): Promise<void> {
  if (isDemoMode() || !isDatabaseConfigured()) {
    demoStore.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actorUserId: entry.actorUserId ?? null,
      actorEmail: entry.actorEmail ?? 'system@interstatehomes.com',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      homeId: entry.homeId ?? null,
      ipAddress: entry.ipAddress ?? '127.0.0.1',
      beforeValues: entry.beforeValues ?? null,
      afterValues: entry.afterValues ?? null,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  const db = getDb();
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorEmail: entry.actorEmail ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    homeId: entry.homeId ?? null,
    ipAddress: entry.ipAddress ?? null,
    beforeValues: entry.beforeValues ?? null,
    afterValues: entry.afterValues ?? null,
  });
}
