import type { FastifyRequest, FastifyReply } from 'fastify';
import { canAccess, type Permission, type UserRole } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';
import { isDatabaseConfigured, isDemoMode } from '../db/client.js';

export interface RequestActor {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  subCompanyId: string | null;
  lastReauthAt: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: RequestActor;
  }
}

const VALID_ROLES = new Set<UserRole>([
  'admin',
  'estimator_approver',
  'project_manager',
  'subcontractor',
  'homeowner',
]);

export function resolveRequestActor(request: FastifyRequest): RequestActor {
  // In DEMO_MODE (before Neon/Google SSO is provisioned), allow explicit role preview header
  // defaulting to estimator_approver so the UI and APIs enforce real RBAC per role.
  if (isDemoMode() || !isDatabaseConfigured()) {
    const headerRole = String(request.headers['x-demo-role'] ?? 'estimator_approver') as UserRole;
    const role: UserRole = VALID_ROLES.has(headerRole) ? headerRole : 'estimator_approver';
    const subCompanyId =
      role === 'subcontractor'
        ? String(request.headers['x-demo-sub-id'] ?? demoStore.subcontractors[0]?.id ?? 'sub-red-cliffs')
        : null;

    const matchedUser = demoStore.users.find((u) => u.role === role) ?? demoStore.users[0]!;
    return {
      userId: matchedUser.id,
      email: matchedUser.email,
      fullName: matchedUser.fullName,
      role,
      subCompanyId,
      lastReauthAt: Date.now(),
    };
  }

  // Production session verification hook (populated by cookie/bearer token lookup)
  return {
    userId: 'anonymous',
    email: 'anonymous@interstatehomes.com',
    fullName: 'Anonymous',
    role: 'homeowner',
    subCompanyId: null,
    lastReauthAt: 0,
  };
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!canAccess(request.actor.role, permission)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Role "${request.actor.role}" lacks permission "${permission}".`,
      });
    }
  };
}

export function requireRecentReauth(maxAgeMinutes = 15) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ageMs = Date.now() - request.actor.lastReauthAt;
    if (ageMs > maxAgeMinutes * 60_000) {
      return reply.status(401).send({
        error: 'ReauthRequired',
        message: 'Recent re-authentication is required before signing a PO or approving a budget.',
      });
    }
  };
}
