'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface SubItem {
  id: string;
  legalName: string;
  dbaName: string | null;
  companyType: string;
  mainPhone: string;
  primaryContactName: string;
  primaryContactEmail: string;
  status: string;
  costCodesServed: string[];
  subdivisionsServed: string[];
  paymentTermsNetDays: number;
  w9TinMasked: string;
  lastPricingUpdatedAt: string;
  complianceStatus: {
    eligible: boolean;
    blockingReasons: Array<{ docType: string; message: string }>;
  };
}

export default function SubcontractorsPage() {
  const { role, subCompanyId } = useRole();
  const [subs, setSubs] = useState<SubItem[]>([]);

  useEffect(() => {
    apiFetch<{ subcontractors: SubItem[] }>('/api/subcontractors', { role, subCompanyId })
      .then((res) => setSubs(res.subcontractors))
      .catch(() => {});
  }, [role, subCompanyId]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#111111]">
          Subcontractor &amp; Supplier Directory
        </h1>
        <p className="text-xs text-[#5F5F5A] mt-0.5">
          Section 5.3 &amp; 8.1 — Trades served, subdivisions, masked W-9 TINs, pricing freshness, and PO eligibility.
        </p>
      </div>

      <div className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase text-[#5F5F5A]">
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-3">Type &amp; Trades</th>
              <th className="py-3 px-3">Primary Contact</th>
              <th className="py-3 px-3">W-9 TIN (Masked)</th>
              <th className="py-3 px-3">Pricing Updated</th>
              <th className="py-3 px-4 text-right">PO Eligibility</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3DE]">
            {subs.map((s) => (
              <tr key={s.id} className="hover:bg-[#F4F4F1]/40">
                <td className="py-3 px-4">
                  <div className="font-semibold text-[#111111]">{s.legalName}</div>
                  <div className="text-[11px] text-[#5F5F5A]">
                    Net {s.paymentTermsNetDays}d · Subdivisions: {s.subdivisionsServed.join(', ')}
                  </div>
                </td>
                <td className="py-3 px-3">
                  <div className="uppercase text-[10px] font-bold text-[#5F5F5A]">
                    {s.companyType}
                  </div>
                  <div className="font-mono mt-0.5">{s.costCodesServed.join(', ')}</div>
                </td>
                <td className="py-3 px-3">
                  <div>{s.primaryContactName}</div>
                  <div className="text-[#5F5F5A]">{s.primaryContactEmail}</div>
                </td>
                <td className="py-3 px-3 font-mono text-[#3B3B38]">{s.w9TinMasked}</td>
                <td className="py-3 px-3 tabular-nums text-[#3B3B38]">
                  {s.lastPricingUpdatedAt}
                </td>
                <td className="py-3 px-4 text-right">
                  {s.complianceStatus.eligible ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] font-semibold">
                      Eligible
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] font-semibold">
                      PO Blocked ({s.complianceStatus.blockingReasons.length})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
