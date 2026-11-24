import { describe, expect, it } from 'vitest';
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
import { buildApp } from '../app.js';

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
  it('serves 81 cost codes and enforces PM financial redaction + COI PO blocking', async () => {
    process.env.DEMO_MODE = 'true';
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

    await app.close();
  });
});
