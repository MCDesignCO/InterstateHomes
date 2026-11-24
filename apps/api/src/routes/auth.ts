import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { writeAuditLog } from '../security/audit.js';
import { demoStore } from '../data/demo-store.js';
import { getDb } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';
import {
  decryptSensitive,
  encryptSensitive,
  generateTotpSecret,
  hashToken,
  verifyPassword,
  verifyTotpToken,
} from '../security/crypto.js';
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  PENDING_MFA_PREFIX,
  SESSION_COOKIE_NAME,
  authenticateRequest,
  clearSessionCookie,
  createSessionForUser,
  deleteDemoSession,
  getDemoSessionByToken,
  getOrInitDemoAuthState,
  getRuntimeMode,
  getSessionTimeoutMinutes,
  isUsingDemoStore,
  setSessionCookie,
} from '../security/auth-plugin.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaVerifySchema = z
  .object({
    code: z.string().min(6).max(12).optional(),
    token: z.string().min(6).max(12).optional(),
  })
  .refine((v) => Boolean(v.code || v.token), {
    message: 'A 6-digit TOTP code is required.',
  });

const reauthSchema = z.object({
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  // Register async session & MFA verification hook on the root Fastify instance
  app.addHook('preHandler', authenticateRequest);

  app.get('/api/auth/me', { schema: { tags: ['Auth'] } }, async (request) => {
    const mode = getRuntimeMode();
    const sessionTimeoutMinutes = await getSessionTimeoutMinutes();
    return {
      authenticated: request.actor.authenticated ?? true,
      mode,
      user: {
        ...request.actor,
        id: request.actor.userId,
      },
      sessionTimeoutMinutes,
    };
  });

  app.post('/api/auth/login', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'InvalidCredentialsPayload' });
    }

    const emailNormalized = parsed.data.email.trim().toLowerCase();
    const userAgent =
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;

    if (isUsingDemoStore()) {
      const user = demoStore.users.find((u) => u.email.toLowerCase() === emailNormalized);
      if (!user) {
        await writeAuditLog({
          actorUserId: null,
          actorEmail: emailNormalized,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'user',
          entityId: emailNormalized,
          ipAddress: request.ip,
          afterValues: { reason: 'user_not_found' },
        });
        return reply.status(401).send({ error: 'InvalidCredentials', message: 'Invalid email or password.' });
      }

      const authState = (await getOrInitDemoAuthState(user.id))!;
      if (authState.status === 'locked') {
        await writeAuditLog({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          ipAddress: request.ip,
          afterValues: { reason: 'account_locked' },
        });
        return reply.status(423).send({
          error: 'AccountLocked',
          message: 'Account is locked after too many failed login attempts. Contact an administrator.',
        });
      }
      if (authState.status === 'disabled') {
        await writeAuditLog({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          ipAddress: request.ip,
          afterValues: { reason: 'account_disabled' },
        });
        return reply.status(403).send({ error: 'AccountDisabled', message: 'User account is disabled.' });
      }

      const valid = await verifyPassword(parsed.data.password, authState.passwordHash);
      if (!valid) {
        authState.failedLoginAttempts += 1;
        const nowLocked = authState.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
        if (nowLocked) {
          authState.status = 'locked';
        }
        await writeAuditLog({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'user',
          entityId: user.id,
          ipAddress: request.ip,
          afterValues: {
            failedLoginAttempts: authState.failedLoginAttempts,
            locked: nowLocked,
          },
        });
        if (nowLocked) {
          return reply.status(423).send({
            error: 'AccountLocked',
            message: 'Account locked after 5 failed login attempts.',
          });
        }
        return reply.status(401).send({
          error: 'InvalidCredentials',
          message: 'Invalid email or password.',
        });
      }

      authState.failedLoginAttempts = 0;
      user.lastLoginAt = new Date().toISOString();

      const { rawToken } = await createSessionForUser({
        userId: user.id,
        mfaPending: authState.mfaEnabled,
        ipAddress: request.ip,
        userAgent,
      });
      setSessionCookie(reply, rawToken);

      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_LOGIN_SUCCESS',
        entityType: 'user',
        entityId: user.id,
        ipAddress: request.ip,
        afterValues: { mfaRequired: authState.mfaEnabled },
      });

      return {
        mfaRequired: authState.mfaEnabled,
        user: {
          id: user.id,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          subCompanyId: user.subCompanyId,
          mfaEnabled: authState.mfaEnabled,
        },
      };
    }

    // Postgres mode
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${emailNormalized}`)
      .limit(1);

    if (!user || !user.passwordHash) {
      await writeAuditLog({
        actorUserId: user?.id ?? null,
        actorEmail: emailNormalized,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id ?? emailNormalized,
        ipAddress: request.ip,
        afterValues: { reason: 'user_not_found_or_no_password' },
      });
      return reply.status(401).send({ error: 'InvalidCredentials', message: 'Invalid email or password.' });
    }

    if (user.status === 'locked') {
      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: request.ip,
        afterValues: { reason: 'account_locked' },
      });
      return reply.status(423).send({
        error: 'AccountLocked',
        message: 'Account is locked after too many failed login attempts. Contact an administrator.',
      });
    }

    if (user.status !== 'active') {
      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: request.ip,
        afterValues: { reason: 'account_disabled' },
      });
      return reply.status(403).send({ error: 'AccountDisabled', message: 'User account is disabled.' });
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      const nextAttempts = user.failedLoginAttempts + 1;
      const nowLocked = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      await db
        .update(users)
        .set({
          failedLoginAttempts: nextAttempts,
          status: nowLocked ? 'locked' : user.status,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: request.ip,
        afterValues: { failedLoginAttempts: nextAttempts, locked: nowLocked },
      });

      if (nowLocked) {
        return reply.status(423).send({
          error: 'AccountLocked',
          message: 'Account locked after 5 failed login attempts.',
        });
      }
      return reply.status(401).send({ error: 'InvalidCredentials', message: 'Invalid email or password.' });
    }

    await db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const mfaRequired = Boolean(user.mfaEnabled && user.mfaSecretEncrypted);
    const { rawToken } = await createSessionForUser({
      userId: user.id,
      mfaPending: mfaRequired,
      ipAddress: request.ip,
      userAgent,
    });
    setSessionCookie(reply, rawToken);

    await writeAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      ipAddress: request.ip,
      afterValues: { mfaRequired },
    });

    return {
      mfaRequired,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        subCompanyId: user.subCompanyId ?? null,
        mfaEnabled: mfaRequired,
      },
    };
  });

  app.post('/api/auth/mfa/setup', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    if (!request.actor.authenticated || request.actor.userId === 'anonymous') {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    const secret = generateTotpSecret();
    const encrypted = encryptSensitive(secret);
    const label = encodeURIComponent(`Interstate Homes:${request.actor.email}`);
    const issuer = encodeURIComponent('Interstate Homes');
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    if (isUsingDemoStore()) {
      const authState = await getOrInitDemoAuthState(request.actor.userId);
      if (!authState) {
        return reply.status(404).send({ error: 'UserNotFound' });
      }
      authState.mfaSecretEncrypted = encrypted;
    } else {
      const db = getDb();
      await db
        .update(users)
        .set({ mfaSecretEncrypted: encrypted, updatedAt: new Date() })
        .where(eq(users.id, request.actor.userId));
    }

    await writeAuditLog({
      actorUserId: request.actor.userId,
      actorEmail: request.actor.email,
      action: 'AUTH_MFA_SETUP_INITIATED',
      entityType: 'user',
      entityId: request.actor.userId,
      ipAddress: request.ip,
    });

    return { secret, otpauthUri };
  });

  app.post('/api/auth/mfa/verify', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const parsed = mfaVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'InvalidMfaPayload', details: parsed.error.flatten() });
    }
    const totpCode = (parsed.data.code ?? parsed.data.token ?? '').trim();

    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
    if (!request.sessionId && !rawToken) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Active or pending session required.' });
    }

    if (isUsingDemoStore()) {
      const memSession = rawToken ? getDemoSessionByToken(rawToken) : undefined;
      if (!memSession || memSession.revokedAt !== null || memSession.expiresAt <= Date.now()) {
        return reply.status(401).send({ error: 'SessionExpired', message: 'Session is invalid or expired.' });
      }
      const user = demoStore.users.find((u) => u.id === memSession.userId);
      const authState = user ? await getOrInitDemoAuthState(user.id) : null;
      if (!user || !authState || !authState.mfaSecretEncrypted) {
        return reply.status(400).send({ error: 'MfaNotConfigured', message: 'MFA setup has not been initiated.' });
      }

      const secret = decryptSensitive(authState.mfaSecretEncrypted);
      if (!verifyTotpToken(secret, totpCode)) {
        await writeAuditLog({
          actorUserId: user.id,
          actorEmail: user.email,
          action: 'AUTH_MFA_FAILED',
          entityType: 'user',
          entityId: user.id,
          ipAddress: request.ip,
        });
        return reply.status(401).send({ error: 'InvalidMfaCode', message: 'Invalid 6-digit MFA code.' });
      }

      authState.mfaEnabled = true;
      memSession.mfaPending = false;
      memSession.lastActivityAt = Date.now();
      memSession.lastReauthAt = Date.now();

      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_MFA_VERIFIED',
        entityType: 'session',
        entityId: memSession.id,
        ipAddress: request.ip,
      });

      return {
        ok: true,
        mfaVerified: true,
        user: {
          id: user.id,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          subCompanyId: user.subCompanyId,
          mfaEnabled: true,
        },
      };
    }

    // Postgres mode
    if (!request.sessionId || request.actor.userId === 'anonymous') {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required for MFA verification.' });
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.actor.userId))
      .limit(1);

    if (!user || !user.mfaSecretEncrypted) {
      return reply.status(400).send({ error: 'MfaNotConfigured', message: 'MFA setup has not been initiated.' });
    }

    const secret = decryptSensitive(user.mfaSecretEncrypted);
    if (!verifyTotpToken(secret, totpCode)) {
      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_MFA_FAILED',
        entityType: 'user',
        entityId: user.id,
        ipAddress: request.ip,
      });
      return reply.status(401).send({ error: 'InvalidMfaCode', message: 'Invalid 6-digit MFA code.' });
    }

    const now = new Date();
    const cleanTokenHash = rawToken
      ? hashToken(rawToken)
      : (request.sessionTokenHash ?? '').replace(PENDING_MFA_PREFIX, '');

    await db
      .update(sessions)
      .set({
        tokenHash: cleanTokenHash,
        lastActivityAt: now,
        lastReauthAt: now,
      })
      .where(eq(sessions.id, request.sessionId));

    if (!user.mfaEnabled) {
      await db
        .update(users)
        .set({ mfaEnabled: true, updatedAt: now })
        .where(eq(users.id, user.id));
    }

    await writeAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'AUTH_MFA_VERIFIED',
      entityType: 'session',
      entityId: request.sessionId,
      ipAddress: request.ip,
    });

    return {
      ok: true,
      mfaVerified: true,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        subCompanyId: user.subCompanyId ?? null,
        mfaEnabled: true,
      },
    };
  });

  app.post('/api/auth/reauth', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const parsed = reauthSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'InvalidReauthPayload', message: 'Password is required.' });
    }

    if (!request.actor.authenticated || request.actor.userId === 'anonymous') {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    const now = Date.now();

    if (isUsingDemoStore()) {
      const authState = await getOrInitDemoAuthState(request.actor.userId);
      if (!authState) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const valid = await verifyPassword(parsed.data.password, authState.passwordHash);
      if (!valid) {
        await writeAuditLog({
          actorUserId: request.actor.userId,
          actorEmail: request.actor.email,
          action: 'AUTH_REAUTH_FAILED',
          entityType: 'session',
          entityId: request.sessionId ?? request.actor.userId,
          ipAddress: request.ip,
        });
        return reply.status(401).send({ error: 'InvalidCredentials', message: 'Password verification failed.' });
      }

      const rawToken = request.cookies?.[SESSION_COOKIE_NAME];
      if (rawToken) {
        const memSession = getDemoSessionByToken(rawToken);
        if (memSession) {
          memSession.lastReauthAt = now;
          memSession.lastActivityAt = now;
        }
      }
      request.actor.lastReauthAt = now;

      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'AUTH_REAUTH_VERIFIED',
        entityType: 'session',
        entityId: request.sessionId ?? request.actor.userId,
        ipAddress: request.ip,
      });

      return { ok: true, reauthenticatedAt: new Date(now).toISOString() };
    }

    // Postgres mode
    const db = getDb();
    const [user] = await db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, request.actor.userId))
      .limit(1);

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'InvalidCredentials', message: 'Password verification failed.' });
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'AUTH_REAUTH_FAILED',
        entityType: 'session',
        entityId: request.sessionId ?? user.id,
        ipAddress: request.ip,
      });
      return reply.status(401).send({ error: 'InvalidCredentials', message: 'Password verification failed.' });
    }

    if (request.sessionId) {
      await db
        .update(sessions)
        .set({ lastReauthAt: new Date(now), lastActivityAt: new Date(now) })
        .where(eq(sessions.id, request.sessionId));
    }
    request.actor.lastReauthAt = now;

    await writeAuditLog({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'AUTH_REAUTH_VERIFIED',
      entityType: 'session',
      entityId: request.sessionId ?? user.id,
      ipAddress: request.ip,
    });

    return { ok: true, reauthenticatedAt: new Date(now).toISOString() };
  });

  app.post('/api/auth/logout', { schema: { tags: ['Auth'] } }, async (request, reply) => {
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];

    if (isUsingDemoStore()) {
      if (rawToken) {
        const memSession = getDemoSessionByToken(rawToken);
        if (memSession) {
          memSession.revokedAt = Date.now();
          deleteDemoSession(memSession.tokenHash);
        }
      }
    } else if (request.sessionId) {
      const db = getDb();
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, request.sessionId));
    } else if (rawToken) {
      const db = getDb();
      const baseHash = hashToken(rawToken);
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.tokenHash, baseHash));
    }

    clearSessionCookie(reply);

    if (request.actor.userId !== 'anonymous') {
      await writeAuditLog({
        actorUserId: request.actor.userId,
        actorEmail: request.actor.email,
        action: 'AUTH_LOGOUT',
        entityType: 'session',
        entityId: request.sessionId ?? request.actor.userId,
        ipAddress: request.ip,
      });
    }

    return { ok: true };
  });
}
