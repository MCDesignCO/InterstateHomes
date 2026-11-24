import type { FastifyInstance } from 'fastify';
import { canAccess, checkSubComplianceForPO } from '@interstate/shared';
import { demoStore } from '../data/demo-store.js';

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get(
    '/api/dashboard/summary',
    {
      schema: {
        tags: ['Dashboard'],
        summary: 'Role-scoped KPIs, Needs Attention feed, Active Homes, and Homes Pipeline',
      },
    },
    async (request) => {
      const role = request.actor.role;
      const canSeeInternal = canAccess(role, 'financials:view_internal');

      if (role === 'subcontractor' && request.actor.subCompanyId) {
        const subId = request.actor.subCompanyId;
        const myQuotes = demoStore.quotes.filter((q) => q.subCompanyId === subId);
        const myPos = demoStore.purchaseOrders.filter((p) => p.subCompanyId === subId);
        const mySub = demoStore.subcontractors.find((s) => s.id === subId);
        const compliance = mySub
          ? checkSubComplianceForPO(
              { status: mySub.status, hasVehiclesOnSite: mySub.hasVehiclesOnSite },
              mySub.complianceDocs,
              {
                poType: mySub.companyType === 'supplier' ? 'supplier' : 'subcontractor',
                requiresUtahLicense: true,
                minGlLimitCents: demoStore.settings.defaultGlMinLimitCents,
                requireMasterAgreement: demoStore.settings.requireMasterAgreement,
                currentMasterAgreementVersion:
                  demoStore.settings.currentMasterAgreementVersion,
              }
            )
          : { eligible: true, blockingReasons: [] };

        return {
          role,
          kpis: {
            activeHomes: new Set([...myQuotes.map((q) => q.homeId), ...myPos.map((p) => p.homeId)]).size,
            quotesOut: myQuotes.filter((q) => q.status === 'sent').length,
            countersToReview: myQuotes.filter((q) => q.status === 'sub_adjusted').length,
            posAwaitingSign: myPos.filter((p) => p.status === 'pending_sub_signature').length,
            complianceAlerts: compliance.blockingReasons.length,
            openClarifications: demoStore.clarifications.filter((c) => c.status === 'open').length,
          },
          needsAttention: [
            ...myQuotes
              .filter((q) => q.status === 'sent')
              .map((q) => ({
                id: q.id,
                badge: 'QUOTE',
                severity: 'blue',
                title: `${q.homeCode} — ${q.costCode} ${q.costCodeName} quote awaiting response`,
                subtitle: `Deadline ${q.responseDeadline} · $${(q.quotedTotalCents / 100).toLocaleString()}`,
                href: '/quotes',
              })),
            ...myPos
              .filter((p) => p.status === 'pending_sub_signature')
              .map((p) => ({
                id: p.id,
                badge: 'SIGN PO',
                severity: 'amber',
                title: `${p.poNumber} ready for subcontractor e-signature`,
                subtitle: `${p.homeCode} · ${p.scopeSummary}`,
                href: '/purchase-orders',
              })),
          ],
          activeHomes: [],
          pipeline: [],
        };
      }

      const complianceAlerts: Array<{
        id: string;
        badge: string;
        severity: string;
        title: string;
        subtitle: string;
        href: string;
      }> = [];

      for (const sub of demoStore.subcontractors) {
        const res = checkSubComplianceForPO(
          { status: sub.status, hasVehiclesOnSite: sub.hasVehiclesOnSite },
          sub.complianceDocs,
          {
            poType: sub.companyType === 'supplier' ? 'supplier' : 'subcontractor',
            requiresUtahLicense: sub.companyType !== 'supplier',
            minGlLimitCents: demoStore.settings.defaultGlMinLimitCents,
            requireMasterAgreement: demoStore.settings.requireMasterAgreement,
            currentMasterAgreementVersion: demoStore.settings.currentMasterAgreementVersion,
          }
        );
        if (!res.eligible) {
          complianceAlerts.push({
            id: `comp-${sub.id}`,
            badge: 'COMPLIANCE',
            severity: 'red',
            title: `${sub.legalName} blocked from new POs`,
            subtitle: res.blockingReasons[0]?.message ?? 'Missing or expired document',
            href: '/compliance',
          });
        }
      }

      const counterAlerts = demoStore.quotes
        .filter((q) => q.status === 'sub_adjusted')
        .map((q) => {
          const latest = q.rounds[q.rounds.length - 1];
          return {
            id: `counter-${q.id}`,
            badge: 'COUNTER',
            severity: 'blue',
            title: `${q.homeCode} · ${q.subName} adjusted quote (${q.costCode} ${q.costCodeName})`,
            subtitle: latest?.comment ?? 'Subcontractor counter-offer awaiting estimator review',
            href: '/quotes',
          };
        });

      const poAlerts = demoStore.purchaseOrders
        .filter((p) => p.status === 'pending_approver_signature')
        .map((p) => ({
          id: `po-${p.id}`,
          badge: 'SIGN PO',
          severity: 'amber',
          title: `${p.poNumber} signed by ${p.subName} — awaiting approver signature`,
          subtitle: `$${(p.totalCents / 100).toLocaleString()} · ${p.masterAgreementRef ?? 'Supplier PO'}`,
          href: '/purchase-orders',
        }));

      const clarAlerts = demoStore.clarifications
        .filter((c) => c.status === 'open')
        .map((c) => ({
          id: `clr-${c.id}`,
          badge: 'CLARIFY',
          severity: 'neutral',
          title: `${c.homeCode} (${c.costCode} ${c.costCodeName}): ${c.title}`,
          subtitle: `Owner: ${c.ownerName} · Due ${c.dueDate}`,
          href: '/clarifications',
        }));

      const stageOrder: Array<{
        key: (typeof demoStore.homes)[number]['stage'];
        label: string;
      }> = [
        { key: 'plan_intake', label: 'Plan Intake' },
        { key: 'estimating', label: 'Estimating' },
        { key: 'quotes_out', label: 'Quotes Out' },
        { key: 'pos_esign', label: 'POs / E-Sign' },
        { key: 'live_budget', label: 'Live Budget' },
      ];

      const pipeline = stageOrder.map((st) => {
        const homesInStage = demoStore.homes.filter((h) => h.stage === st.key);
        const totalEstimateCents = homesInStage.reduce((acc, h) => {
          const est = demoStore.estimates.get(h.id);
          if (!est) return acc;
          const sum = est.lines
            .filter((l) => canSeeInternal || !['00L', '88', '92', '93'].includes(l.costCode))
            .reduce((s, l) => s + l.extendedCents, 0);
          return acc + sum;
        }, 0);
        return {
          stage: st.key,
          label: st.label,
          count: homesInStage.length,
          totalEstimateCents,
        };
      });

      const activeHomes = demoStore.homes.map((h) => {
        const homePos = demoStore.purchaseOrders.filter((p) => p.homeId === h.id);
        const signedCount = homePos.filter((p) => p.status === 'fully_signed').length;
        return {
          id: h.id,
          homeCode: h.homeCode,
          subdivisionName: h.subdivisionName,
          planName: h.planName,
          stage: h.stage,
          planRevision: h.planRevision,
          posSignedLabel: `${signedCount}/${homePos.length || 0}`,
          soldAmountCents: canSeeInternal ? h.soldAmountCents : null,
        };
      });

      return {
        role,
        kpis: {
          activeHomes: demoStore.homes.length,
          quotesOut: demoStore.quotes.filter((q) => q.status === 'sent').length,
          countersToReview: counterAlerts.length,
          posAwaitingSign: demoStore.purchaseOrders.filter((p) => p.status !== 'fully_signed').length,
          complianceAlerts: complianceAlerts.length,
          openClarifications: clarAlerts.length,
        },
        needsAttention: [...complianceAlerts, ...counterAlerts, ...poAlerts, ...clarAlerts],
        activeHomes,
        pipeline,
      };
    }
  );
}
