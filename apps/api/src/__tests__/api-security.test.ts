import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptSensitive,
  encryptSensitive,
  generateTotpCode,
  generateTotpSecret,
  hashPassword,
  maskTin,
  verifyPassword,
  verifyTotpToken,
} from '../security/crypto.js';
import {
  SESSION_COOKIE_NAME,
  getDemoSessionByToken,
  resetDemoAuthState,
} from '../security/auth-plugin.js';
import { buildApp } from '../app.js';

function extractCookieValue(setCookieHeader: string | string[] | undefined, name: string): string {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  for (const header of list) {
    const firstPart = header.split(';')[0] ?? '';
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx === -1) continue;
    const key = firstPart.slice(0, eqIdx).trim();
    const val = firstPart.slice(eqIdx + 1).trim();
    if (key === name) return val;
  }
  return '';
}

describe('API Security Primitives', () => {
  it('hashes and verifies passwords with scrypt', async () => {
    const hash = await hashPassword('InterstateHomes2026!');
    expect(await verifyPassword('InterstateHomes2026!', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword!', hash)).toBe(false);
  });

  it('encrypts/decrypts sensitive W-9 TINs and masks them everywhere', () => {
    const raw = '87-1234821';
    const encrypted = encryptSensitive(raw);
    expect(encrypted).not.toContain('4821');
    expect(decryptSensitive(encrypted)).toBe(raw);

    const masked = maskTin(raw);
    expect(masked.last4).toBe('4821');
    expect(masked.masked).toBe('***-**-4821');
  });

  it('generates and verifies RFC 6238 TOTP MFA codes', () => {
    const secret = generateTotpSecret();
    const now = 1700000000000;
    const code = generateTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpToken(secret, code, now)).toBe(true);
    expect(verifyTotpToken(secret, '000000', now)).toBe(false);
  });
});

describe('API Integration & RBAC Smoke', () => {
  const origDemoMode = process.env.DEMO_MODE;
  const origDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
    delete process.env.DATABASE_URL;
    resetDemoAuthState();
  });

  afterEach(() => {
    process.env.DEMO_MODE = origDemoMode;
    if (origDbUrl !== undefined) {
      process.env.DATABASE_URL = origDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    resetDemoAuthState();
  });

  it('serves 81 cost codes and enforces PM financial redaction + COI PO blocking', async () => {
    const app = await buildApp();

    const codesRes = await app.inject({ method: 'GET', url: '/api/cost-codes' });
    expect(codesRes.statusCode).toBe(200);
    expect(codesRes.json().costCodeCount).toBe(81);

    // PM cannot see internal cost codes (00L, 88, 92, 93) or soldAmountCents
    const pmEstRes = await app.inject({
      method: 'GET',
      url: '/api/homes/home-ch-14/estimate',
      headers: { 'x-demo-role': 'project_manager' },
    });
    expect(pmEstRes.statusCode).toBe(200);
    const pmJson = pmEstRes.json();
    expect(pmJson.home.soldAmountCents).toBeNull();
    expect(
      pmJson.estimate.lines.some((l: { costCode: string }) => l.costCode === '93')
    ).toBe(false);

    // Attempting to issue a PO to Hurricane Plumbing (expired COI) is blocked (422) and names coi_gl
    const poRes = await app.inject({
      method: 'POST',
      url: '/api/purchase-orders',
      headers: { 'x-demo-role': 'estimator_approver' },
      payload: {
        homeId: 'home-ch-14',
        costCode: '19',
        subId: 'sub-hurricane-plumbing',
        poType: 'subcontractor',
        scopeSummary: 'Plumbing rough-in & finish',
        totalCents: 2150000,
      },
    });
    expect(poRes.statusCode).toBe(422);
    expect(poRes.json().error).toBe('ComplianceBlocked');
    expect(poRes.json().blockingReasons[0].docType).toBe('coi_gl');

    // Warehouse refresh is admin-only
    const pmRefresh = await app.inject({
      method: 'POST',
      url: '/api/admin/warehouse/refresh',
      headers: { 'x-demo-role': 'project_manager' },
    });
    expect(pmRefresh.statusCode).toBe(403);

    const adminRefresh = await app.inject({
      method: 'POST',
      url: '/api/admin/warehouse/refresh',
      headers: { 'x-demo-role': 'admin' },
    });
    expect(adminRefresh.statusCode).toBe(200);
    expect(adminRefresh.json().ok).toBe(true);
    expect(adminRefresh.json().rowsWritten).toBeGreaterThan(0);

    await app.close();
  });

  it('supports httpOnly cookie login, MFA setup/verify, reauth, inactivity timeout, and logout', async () => {
    const app = await buildApp();
    const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'ChangeMe-Interstate2026!';

    // 1. Login with valid password -> sets httpOnly ih_session cookie
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'chase@interstatehomes.com',
        password: defaultPassword,
      },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().mfaRequired).toBe(false);
    const setCookieHeader = loginRes.headers['set-cookie'];
    expect(String(setCookieHeader)).toContain('HttpOnly');
    const sessionToken = extractCookieValue(setCookieHeader, SESSION_COOKIE_NAME);
    expect(sessionToken.length).toBeGreaterThan(20);

    // 2. GET /api/auth/me returns actor, mode, and sessionTimeoutMinutes
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().mode).toBe('demo');
    expect(meRes.json().sessionTimeoutMinutes).toBe(30);
    expect(meRes.json().user.email).toBe('chase@interstatehomes.com');
    expect(meRes.json().user.role).toBe('admin');

    // 3. Setup MFA and activate via TOTP verify
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/setup',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret, otpauthUri } = setupRes.json() as { secret: string; otpauthUri: string };
    expect(secret.length).toBeGreaterThan(10);
    expect(otpauthUri).toContain('otpauth://totp/');

    const badMfaRes = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      payload: { code: '000000' },
    });
    expect(badMfaRes.statusCode).toBe(401);

    const validCode = generateTotpCode(secret);
    const enableMfaRes = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      payload: { code: validCode },
    });
    expect(enableMfaRes.statusCode).toBe(200);
    expect(enableMfaRes.json().mfaVerified).toBe(true);

    // 4. Re-login now requires MFA and blocks protected endpoints until verified
    const mfaLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'chase@interstatehomes.com',
        password: defaultPassword,
      },
    });
    expect(mfaLoginRes.statusCode).toBe(200);
    expect(mfaLoginRes.json().mfaRequired).toBe(true);
    const pendingToken = extractCookieValue(mfaLoginRes.headers['set-cookie'], SESSION_COOKIE_NAME);
    expect(pendingToken.length).toBeGreaterThan(20);

    const blockedMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(blockedMe.statusCode).toBe(401);
    expect(blockedMe.json().error).toBe('MfaRequired');

    const verifyLoginMfa = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/verify',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
      payload: { code: generateTotpCode(secret) },
    });
    expect(verifyLoginMfa.statusCode).toBe(200);

    const unlockedMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(unlockedMe.statusCode).toBe(200);
    expect(unlockedMe.json().user.mfaEnabled).toBe(true);

    // 5. Reauth enforcement before PO signing
    const memSess = getDemoSessionByToken(pendingToken)!;
    memSess.lastReauthAt = Date.now() - 20 * 60_000; // stale (> 15 min)

    const staleSignRes = await app.inject({
      method: 'POST',
      url: '/api/purchase-orders/po-ch14-22-01/sign',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(staleSignRes.statusCode).toBe(401);
    expect(staleSignRes.json().error).toBe('ReauthRequired');

    const badReauth = await app.inject({
      method: 'POST',
      url: '/api/auth/reauth',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
      payload: { password: 'WrongPassword!' },
    });
    expect(badReauth.statusCode).toBe(401);

    const okReauth = await app.inject({
      method: 'POST',
      url: '/api/auth/reauth',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
      payload: { password: defaultPassword },
    });
    expect(okReauth.statusCode).toBe(200);
    expect(okReauth.json().ok).toBe(true);

    const freshSignRes = await app.inject({
      method: 'POST',
      url: '/api/purchase-orders/po-ch14-22-01/sign',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(freshSignRes.statusCode).toBe(200);

    // 6. Logout revokes session & clears cookie
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const afterLogoutMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${pendingToken}` },
    });
    expect(afterLogoutMe.statusCode).toBe(401);

    // 7. Inactivity timeout (> 30 min) expires session
    const firstSess = getDemoSessionByToken(sessionToken)!;
    firstSess.lastActivityAt = Date.now() - 31 * 60_000;
    const timedOutMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
    });
    expect(timedOutMe.statusCode).toBe(401);
    expect(timedOutMe.json().error).toBe('SessionTimeout');

    await app.close();
  });

  it('enforces 5-attempt lockout on failed logins', async () => {
    const app = await buildApp();
    const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'ChangeMe-Interstate2026!';

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'amanda@interstatehomes.com', password: 'WrongPassword!' },
      });
      expect(res.statusCode).toBe(401);
    }

    // 5th failed attempt locks the account
    const fifth = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'amanda@interstatehomes.com', password: 'WrongPassword!' },
    });
    expect(fifth.statusCode).toBe(423);
    expect(fifth.json().error).toBe('AccountLocked');

    // Subsequent login with the CORRECT password is still blocked while locked
    const sixth = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'amanda@interstatehomes.com', password: defaultPassword },
    });
    expect(sixth.statusCode).toBe(423);
    expect(sixth.json().error).toBe('AccountLocked');

    await app.close();
  });

  it('never falls back to x-demo-role headers in Postgres mode (DEMO_MODE=false)', async () => {
    process.env.DEMO_MODE = 'false';
    const app = await buildApp();

    // Public health check still works
    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    expect(healthRes.statusCode).toBe(200);

    // Protected endpoints reject unauthenticated requests even if x-demo-role header is spoofed
    const homesRes = await app.inject({
      method: 'GET',
      url: '/api/homes',
      headers: { 'x-demo-role': 'admin' },
    });
    expect(homesRes.statusCode).toBe(401);
    expect(homesRes.json().error).toBe('Unauthorized');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { 'x-demo-role': 'admin' },
    });
    expect(meRes.statusCode).toBe(401);
    expect(meRes.json().mode).toBe('postgres');

    await app.close();
  });
});
