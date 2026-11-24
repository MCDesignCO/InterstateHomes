import { describe, expect, it } from 'vitest';
import {
  COST_CODES,
  COST_CLASSIFICATIONS,
  INTERNAL_ONLY_COST_CODES,
  canAccess,
  calculateFinalBudget,
  checkSubComplianceForPO,
  formatPoNumber,
  isCostCodeTextValid,
  projectHomeownerEstimate,
} from '../index.js';

describe('Section 7 Cost Codes', () => {
  it('contains exact 81 cost codes across 11 classifications stored as text', () => {
    expect(COST_CLASSIFICATIONS).toHaveLength(11);
    expect(COST_CODES).toHaveLength(81);

    const uniqueCodes = new Set(COST_CODES.map((c) => c.code));
    expect(uniqueCodes.size).toBe(81);

    // Leading zeros and alphanumeric codes remain exact text
    expect(isCostCodeTextValid('00L')).toBe(true);
    expect(isCostCodeTextValid('03')).toBe(true);
    expect(isCostCodeTextValid('00')).toBe(true);
    expect(isCostCodeTextValid('3')).toBe(false);
    expect(INTERNAL_ONLY_COST_CODES.has('93')).toBe(true);
    expect(INTERNAL_ONLY_COST_CODES.has('00L')).toBe(true);
  });
});

describe('Section 4 Role Permissions', () => {
  it('enforces estimator vs PM vs sub access rules', () => {
    expect(canAccess('estimator_approver', 'financials:view_internal')).toBe(true);
    expect(canAccess('estimator_approver', 'roles:manage')).toBe(false);
    expect(canAccess('estimator_approver', 'templates:manage')).toBe(false);

    expect(canAccess('project_manager', 'budgets:view')).toBe(true);
    expect(canAccess('project_manager', 'financials:view_internal')).toBe(false);
    expect(canAccess('project_manager', 'budgets:approve')).toBe(false);

    expect(canAccess('subcontractor', 'quotes:respond_own')).toBe(true);
    expect(canAccess('subcontractor', 'financials:view_internal')).toBe(false);
  });
});

describe('Section 8.2 & Rule 4 PO Compliance Gate', () => {
  const baseDocs = [
    {
      docType: 'coi_gl' as const,
      reviewStatus: 'approved' as const,
      expiresAt: '2027-06-01',
      limitAmountCents: 200_000_000,
      additionalInsured: true,
    },
    {
      docType: 'auto_liability' as const,
      reviewStatus: 'approved' as const,
      expiresAt: '2027-06-01',
      limitAmountCents: 100_000_000,
    },
    {
      docType: 'workers_comp' as const,
      reviewStatus: 'approved' as const,
      expiresAt: '2027-06-01',
    },
    {
      docType: 'w9' as const,
      reviewStatus: 'approved' as const,
    },
    {
      docType: 'utah_license' as const,
      reviewStatus: 'approved' as const,
      expiresAt: '2027-11-30',
      licenseClassification: 'B100',
    },
    {
      docType: 'master_agreement' as const,
      reviewStatus: 'approved' as const,
      agreementVersion: '2026.1',
    },
  ];

  it('allows PO when sub is active and all docs are current', () => {
    const result = checkSubComplianceForPO(
      { status: 'active', hasVehiclesOnSite: true },
      baseDocs,
      {
        poType: 'subcontractor',
        requiresUtahLicense: true,
        minGlLimitCents: 100_000_000,
        requireMasterAgreement: true,
        currentMasterAgreementVersion: '2026.1',
        asOfDate: '2026-11-24',
      }
    );
    expect(result.eligible).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('blocks PO and names COI when COI is expired', () => {
    const docsWithExpiredCoi = baseDocs.map((d) =>
      d.docType === 'coi_gl' ? { ...d, expiresAt: '2026-10-01' } : d
    );
    const result = checkSubComplianceForPO(
      { status: 'active', hasVehiclesOnSite: true },
      docsWithExpiredCoi,
      {
        poType: 'subcontractor',
        requiresUtahLicense: true,
        minGlLimitCents: 100_000_000,
        requireMasterAgreement: true,
        currentMasterAgreementVersion: '2026.1',
        asOfDate: '2026-11-24',
      }
    );
    expect(result.eligible).toBe(false);
    expect(result.blockingReasons.some((b) => b.docType === 'coi_gl')).toBe(true);
  });

  it('allows supplier PO (e.g. Interstate Rock ready-mix) with active status and W-9', () => {
    const result = checkSubComplianceForPO(
      { status: 'active', hasVehiclesOnSite: false },
      [{ docType: 'w9', reviewStatus: 'approved' }],
      {
        poType: 'supplier',
        requiresUtahLicense: false,
        minGlLimitCents: 100_000_000,
        requireMasterAgreement: true,
        currentMasterAgreementVersion: '2026.1',
        asOfDate: '2026-11-24',
      }
    );
    expect(result.eligible).toBe(true);
  });
});

describe('Section 9 Business Rules (PO Format, Budget Build, Homeowner Redaction)', () => {
  it('formats PO numbers preserving leading zero cost codes', () => {
    expect(formatPoNumber('CH', '14', '03', 1)).toBe('CH14-03-01');
    expect(formatPoNumber('LK', '22', '31', 2)).toBe('LK22-31-02');
  });

  it('computes final budget strictly from signed POs plus fixed amounts and blocks unsigned sub lines', () => {
    const res = calculateFinalBudget(
      [
        {
          costCode: '31',
          costCodeName: 'Drywall',
          pricingSource: 'sub',
          estimatedAmountCents: 1_500_000,
          isAllowanceOrFixed: false,
        },
        {
          costCode: '90',
          costCodeName: 'Management',
          pricingSource: 'fixed',
          estimatedAmountCents: 800_000,
          isAllowanceOrFixed: true,
        },
      ],
      [{ costCode: '31', totalCents: 1_550_000, status: 'fully_signed' }],
      [{ costCode: '90', amountCents: 800_000 }]
    );
    expect(res.canApprove).toBe(true);
    expect(res.totalFinalBudgetCents).toBe(2_350_000);
    expect(res.totalVarianceCents).toBe(50_000);

    const blocked = calculateFinalBudget(
      [
        {
          costCode: '31',
          costCodeName: 'Drywall',
          pricingSource: 'sub',
          estimatedAmountCents: 1_500_000,
          isAllowanceOrFixed: false,
        },
      ],
      [{ costCode: '31', totalCents: 1_550_000, status: 'pending_sub_signature' }],
      []
    );
    expect(blocked.canApprove).toBe(false);
    expect(blocked.blockingCostCodes[0]?.costCode).toBe('31');
  });

  it('strips internal cost codes, vendor names, and unit prices from homeowner estimate projection', () => {
    const projected = projectHomeownerEstimate({
      homeCode: 'CH 14',
      planName: 'Zion 2450',
      subdivisionName: 'Cottonwood Hollow',
      lines: [
        {
          costCode: '00L',
          costCodeName: 'Land / Lot',
          classificationCode: '7.1',
          classificationName: 'Land',
          pricingSource: 'fixed',
          quantity: 1,
          unit: 'LS',
          unitPriceCents: 15_000_000,
          extendedCents: 15_000_000,
          selectedSubName: null,
        },
        {
          costCode: '31',
          costCodeName: 'Drywall',
          classificationCode: '7.7',
          classificationName: 'Interior Finishes',
          pricingSource: 'sub',
          quantity: 9200,
          unit: 'sq ft',
          unitPriceCents: 185,
          extendedCents: 1_702_000,
          selectedSubName: 'Red Cliffs Drywall LLC',
        },
        {
          costCode: '93',
          costCodeName: 'Profit',
          classificationCode: '7.11',
          classificationName: 'Profit',
          pricingSource: 'fixed',
          quantity: 1,
          unit: 'LS',
          unitPriceCents: 6_500_000,
          extendedCents: 6_500_000,
          selectedSubName: null,
        },
      ],
    });

    expect(projected.grandTotalCents).toBe(1_702_000);
    expect(projected.classifications).toHaveLength(1);
    const json = JSON.stringify(projected);
    expect(json).not.toContain('Red Cliffs Drywall');
    expect(json).not.toContain('00L');
    expect(json).not.toContain('93');
    expect(json).not.toContain('unitPriceCents');
  });
});
