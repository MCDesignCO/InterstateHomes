import {
  COST_CLASSIFICATIONS,
  COST_CODES,
  DEFAULT_SYSTEM_SETTINGS,
} from '@interstate/shared';
import { closeDb, getDb, isDatabaseConfigured } from './client.js';
import {
  costClassifications,
  costCodes,
  subdivisions,
  systemSettings,
} from './schema/index.js';

const INITIAL_SUBDIVISIONS = [
  { code: 'CH', name: 'Cottonwood Hollow', city: 'La Verkin', jurisdiction: 'La Verkin City', defaultHoaFeeCents: 65000 },
  { code: 'LK', name: 'Lava Knolls', city: 'Hurricane', jurisdiction: 'Hurricane City', defaultHoaFeeCents: 120000 },
  { code: 'NS', name: 'North Slope at Copper Rock', city: 'Hurricane', jurisdiction: 'Hurricane City', defaultHoaFeeCents: 185000 },
  { code: 'PS', name: "Park Side at Grandpa's Pond", city: 'Hurricane', jurisdiction: 'Hurricane City', defaultHoaFeeCents: 95000 },
  { code: 'ZV', name: 'Zion Vista', city: 'Hurricane', jurisdiction: 'Hurricane City', defaultHoaFeeCents: 110000 },
  { code: 'SH', name: 'Sand Hollow', city: 'Hurricane', jurisdiction: 'Washington County', defaultHoaFeeCents: 140000 },
];

async function seed() {
  if (!isDatabaseConfigured()) {
    console.error('DATABASE_URL must be set to seed the database.');
    process.exit(1);
  }

  const db = getDb();

  for (const cls of COST_CLASSIFICATIONS) {
    await db
      .insert(costClassifications)
      .values({
        code: cls.code,
        name: cls.name,
        sortOrder: cls.sortOrder,
      })
      .onConflictDoUpdate({
        target: costClassifications.code,
        set: { name: cls.name, sortOrder: cls.sortOrder },
      });
  }

  for (const cc of COST_CODES) {
    await db
      .insert(costCodes)
      .values({
        code: cc.code,
        name: cc.name,
        classificationCode: cc.classificationCode,
        sortOrder: cc.sortOrder,
        estimateBuiltFrom: cc.estimateBuiltFrom,
        pricingSourcesJson: cc.pricingSources,
        isInternalOnly: cc.isInternalOnly,
        isEstimateable: cc.isEstimateable,
        requiresUtahLicense: cc.requiresUtahLicense,
        allowedSubLinesJson: cc.allowedSubLines,
        active: true,
      })
      .onConflictDoUpdate({
        target: costCodes.code,
        set: {
          name: cc.name,
          classificationCode: cc.classificationCode,
          sortOrder: cc.sortOrder,
          estimateBuiltFrom: cc.estimateBuiltFrom,
          pricingSourcesJson: cc.pricingSources,
          isInternalOnly: cc.isInternalOnly,
          isEstimateable: cc.isEstimateable,
          requiresUtahLicense: cc.requiresUtahLicense,
          allowedSubLinesJson: cc.allowedSubLines,
        },
      });
  }

  for (const sub of INITIAL_SUBDIVISIONS) {
    await db
      .insert(subdivisions)
      .values(sub)
      .onConflictDoNothing({ target: subdivisions.code });
  }

  await db
    .insert(systemSettings)
    .values({
      id: 'default',
      minPasswordLength: DEFAULT_SYSTEM_SETTINGS.minPasswordLength,
      sessionTimeoutMinutes: DEFAULT_SYSTEM_SETTINGS.sessionTimeoutMinutes,
      inactiveDisableDays: DEFAULT_SYSTEM_SETTINGS.inactiveDisableDays,
      auditRetentionYears: DEFAULT_SYSTEM_SETTINGS.auditRetentionYears,
      breachNoticeHours: DEFAULT_SYSTEM_SETTINGS.breachNoticeHours,
      maxPlanUploadMb: DEFAULT_SYSTEM_SETTINGS.maxPlanUploadMb,
      warehouseRefreshSchedule: DEFAULT_SYSTEM_SETTINGS.warehouseRefreshSchedule,
      coiReminderDaysJson: DEFAULT_SYSTEM_SETTINGS.coiReminderDays,
      requireMasterAgreement: DEFAULT_SYSTEM_SETTINGS.requireMasterAgreement,
      currentMasterAgreementVersion: DEFAULT_SYSTEM_SETTINGS.currentMasterAgreementVersion,
      defaultGlMinLimitCents: DEFAULT_SYSTEM_SETTINGS.defaultGlMinLimitCents,
      defaultAutoMinLimitCents: DEFAULT_SYSTEM_SETTINGS.defaultAutoMinLimitCents,
      poNumberFormat: DEFAULT_SYSTEM_SETTINGS.poNumberFormat,
    })
    .onConflictDoNothing({ target: systemSettings.id });

  console.log(
    `Seeded ${COST_CLASSIFICATIONS.length} classifications, ${COST_CODES.length} cost codes, ${INITIAL_SUBDIVISIONS.length} subdivisions, and default system settings.`
  );
  await closeDb();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
