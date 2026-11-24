'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, formatCurrencyExact } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface PriceSheet {
  id: string;
  subName: string;
  costCode: string;
  costCodeName: string;
  subdivisionScope: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  inclusionsExclusions: string;
  items: Array<{ id: string; subLineName: string; unit: string; unitPriceCents: number }>;
}

export default function PriceSheetsPage() {
  const { role, subCompanyId } = useRole();
  const [sheets, setSheets] = useState<PriceSheet[]>([]);

  useEffect(() => {
    apiFetch<{ priceSheets: PriceSheet[] }>('/api/price-sheets', { role, subCompanyId })
      .then((res) => setSheets(res.priceSheets))
      .catch(() => {});
  }, [role, subCompanyId]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#111111]">
          Effective-Dated Trade Price Sheets
        </h1>
        <p className="text-xs text-[#5F5F5A] mt-0.5">
          Section 5.4 &amp; 8.3 — Price sheet changes take effect on a date and never alter already-sent quotes or signed POs.
        </p>
      </div>

      <div className="space-y-4">
        {sheets.map((ps) => (
          <div key={ps.id} className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E3E3DE] flex flex-wrap items-center justify-between gap-2 bg-[#F4F4F1]/60">
              <div>
                <div className="font-display font-bold text-sm text-[#111111]">
                  {ps.subName} · {ps.costCode} {ps.costCodeName}
                </div>
                <div className="text-xs text-[#5F5F5A]">{ps.inclusionsExclusions}</div>
              </div>
              <div className="text-xs text-[#3B3B38] tabular-nums">
                Effective {ps.effectiveFrom} · Scope: {ps.subdivisionScope}
              </div>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E3E3DE] text-[10px] font-display uppercase text-[#5F5F5A]">
                  <th className="py-2 px-4">Sub-Line Item</th>
                  <th className="py-2 px-3">Unit</th>
                  <th className="py-2 px-4 text-right">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E3DE]">
                {ps.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 px-4 font-medium">{item.subLineName}</td>
                    <td className="py-2 px-3 text-[#5F5F5A]">{item.unit}</td>
                    <td className="py-2 px-4 text-right tabular-nums font-semibold">
                      {formatCurrencyExact(item.unitPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
