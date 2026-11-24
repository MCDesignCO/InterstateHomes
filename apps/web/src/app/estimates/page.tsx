'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, formatCurrencyExact } from '@/lib/api';
import { useRole } from '@/lib/role-context';
import { InterstateLogo } from '@/components/InterstateLogo';

interface EstimateLine {
  costCode: string;
  costCodeName: string;
  classificationCode: string;
  classificationName: string;
  quantity: number;
  unit: string;
  quantitySource: string;
  pricingSource: string;
  selectedSubId: string | null;
  selectedSubName: string | null;
  unitPriceCents: number;
  extendedCents: number;
  competingSubQuotes: Array<{
    subId: string;
    subName: string;
    totalCents: number;
    isPreferred: boolean;
  }>;
}

interface EstimatePayload {
  home: { id: string; homeCode: string; subdivisionName: string; planName: string };
  estimate: {
    id: string;
    versionNumber: number;
    status: string;
    totalEstimatedCents: number;
    lines: EstimateLine[];
  };
}

interface HomeownerProjection {
  homeCode: string;
  planName: string;
  subdivisionName: string;
  grandTotalCents: number;
  classifications: Array<{
    classificationCode: string;
    classificationName: string;
    totalCents: number;
    lines: Array<{ costCode: string; costCodeName: string; extendedCents: number }>;
  }>;
}

export default function EstimatesPage() {
  const { role, subCompanyId } = useRole();
  const [homeId, setHomeId] = useState('home-ch-14');
  const [data, setData] = useState<EstimatePayload | null>(null);
  const [homeownerPreview, setHomeownerPreview] = useState<HomeownerProjection | null>(null);
  const [showHomeownerPdf, setShowHomeownerPdf] = useState(false);

  const loadEstimate = (targetHomeId: string) => {
    apiFetch<EstimatePayload>(`/api/homes/${targetHomeId}/estimate`, { role, subCompanyId })
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    loadEstimate(homeId);
  }, [homeId, role, subCompanyId]);

  const handleToggleHomeownerPdf = async () => {
    if (!showHomeownerPdf) {
      const res = await apiFetch<{ projection: HomeownerProjection }>(
        `/api/homes/${homeId}/estimate/homeowner`,
        { role, subCompanyId }
      );
      setHomeownerPreview(res.projection);
    }
    setShowHomeownerPdf((v) => !v);
  };

  const handleSelectCompetingSub = async (costCode: string, subId: string, totalCents: number) => {
    await apiFetch(`/api/estimates/${homeId}/lines/${costCode}`, {
      method: 'PATCH',
      role,
      subCompanyId,
      body: JSON.stringify({
        selectedSubId: subId,
        fixedAmountCents: totalCents,
      }),
    });
    loadEstimate(homeId);
  };

  const grouped = new Map<string, { name: string; lines: EstimateLine[] }>();
  for (const line of data?.estimate.lines ?? []) {
    const existing = grouped.get(line.classificationCode) ?? {
      name: line.classificationName,
      lines: [],
    };
    existing.lines.push(line);
    grouped.set(line.classificationCode, existing);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#111111]">
            81-Code Estimate Builder
          </h1>
          <p className="text-xs text-[#5F5F5A] mt-0.5">
            Section 5.2 &amp; Section 7 — Side-by-side sub pricing, fixed/allowance entries, and
            Internal vs. Homeowner PDF output.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <select
            value={homeId}
            onChange={(e) => {
              setHomeId(e.target.value);
              setShowHomeownerPdf(false);
            }}
            className="border border-[#E3E3DE] bg-white rounded-md px-3 py-2 text-xs font-semibold"
          >
            <option value="home-ch-14">CH 14 — Zion 2450</option>
            <option value="home-lk-22">LK 22 — Coral 2120</option>
            <option value="home-ns-08">NS 08 — Copper View 3180</option>
            <option value="home-ps-11">PS 11 — Willow 1890</option>
          </select>
          {(role === 'admin' || role === 'estimator_approver') && (
            <button
              onClick={handleToggleHomeownerPdf}
              className="px-4 py-2 rounded-md bg-[#FCAE1A] text-xs font-display font-bold text-[#111111] hover:bg-[#111111] hover:text-white transition-colors"
            >
              {showHomeownerPdf ? 'Back to Internal Builder' : 'Preview Homeowner Estimate PDF'}
            </button>
          )}
        </div>
      </div>

      {showHomeownerPdf && homeownerPreview ? (
        <div className="bg-white border border-[#E3E3DE] rounded-lg p-8 max-w-4xl mx-auto shadow-sm space-y-6">
          <div className="flex items-start justify-between border-b border-[#E3E3DE] pb-5">
            <div>
              <InterstateLogo variant="light" />
              <div className="text-xs text-[#5F5F5A] mt-2">
                52 S 850 W, Suite 202A, Hurricane, UT 84737 · 435-635-2944 · myinterstatehome.com
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-display uppercase tracking-wider text-[#8A5A00] font-bold">
                Homeowner Estimate
              </div>
              <div className="text-lg font-display font-bold text-[#111111] mt-0.5">
                {homeownerPreview.homeCode} — {homeownerPreview.planName}
              </div>
              <div className="text-xs text-[#5F5F5A]">{homeownerPreview.subdivisionName}</div>
            </div>
          </div>

          <div className="bg-[#F4F4F1] rounded px-4 py-2.5 text-xs text-[#3B3B38]">
            Rule 10 Verified: Vendor names, unit costs, land (00L), real estate fees (88), fixed
            overhead (92), profit (93), and margin are stripped from this view.
          </div>

          <div className="space-y-4">
            {homeownerPreview.classifications.map((cls) => (
              <div key={cls.classificationCode} className="border border-[#E3E3DE] rounded-md">
                <div className="flex items-center justify-between bg-[#F4F4F1] px-4 py-2 text-xs font-display font-bold">
                  <span>
                    {cls.classificationCode} {cls.classificationName}
                  </span>
                  <span className="tabular-nums">{formatCurrencyExact(cls.totalCents)}</span>
                </div>
                <div className="divide-y divide-[#E3E3DE]">
                  {cls.lines.map((l) => (
                    <div key={l.costCode} className="flex justify-between px-4 py-2 text-xs">
                      <span>
                        <span className="font-mono text-[#5F5F5A] mr-2">{l.costCode}</span>
                        {l.costCodeName}
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatCurrencyExact(l.extendedCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center border-t-2 border-[#111111] pt-4 text-base font-display font-bold">
            <span>Estimated Construction Total</span>
            <span className="tabular-nums">{formatCurrencyExact(homeownerPreview.grandTotalCents)}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-[#E3E3DE] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-[#3B3B38]">
              <strong className="text-[#111111]">{data?.home.homeCode}</strong> ·{' '}
              {data?.home.subdivisionName} · {data?.home.planName} · Estimate v
              {data?.estimate.versionNumber} ({data?.estimate.status})
            </div>
            <div className="text-sm font-display font-bold tabular-nums">
              Total Estimate: {formatCurrencyExact(data?.estimate.totalEstimatedCents)}
            </div>
          </div>

          {Array.from(grouped.entries()).map(([clsCode, cls]) => (
            <div key={clsCode} className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
              <div className="bg-[#111111] text-white px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-display font-bold tracking-wide">
                  {clsCode} {cls.name}
                </span>
                <span className="text-xs tabular-nums text-[#FCAE1A] font-semibold">
                  {formatCurrencyExact(
                    cls.lines.reduce((s, l) => s + l.extendedCents, 0)
                  )}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase text-[#5F5F5A]">
                      <th className="py-2 px-3 w-16">Code</th>
                      <th className="py-2 px-3">Line Item</th>
                      <th className="py-2 px-3">Source</th>
                      <th className="py-2 px-3">Selected Sub / Side-by-Side</th>
                      <th className="py-2 px-3 text-right">Qty / Unit</th>
                      <th className="py-2 px-3 text-right">Extended</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E3DE]">
                    {cls.lines.map((line) => (
                      <tr key={line.costCode} className="hover:bg-[#F4F4F1]/40">
                        <td className="py-2 px-3 font-mono font-semibold text-[#111111]">
                          {line.costCode}
                        </td>
                        <td className="py-2 px-3 font-medium text-[#111111]">
                          {line.costCodeName}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-[#F4F4F1] text-[#3B3B38] text-[10px] font-semibold uppercase">
                            {line.pricingSource}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {line.competingSubQuotes.length > 1 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {line.competingSubQuotes.map((q) => (
                                <button
                                  key={q.subId}
                                  onClick={() =>
                                    handleSelectCompetingSub(line.costCode, q.subId, q.totalCents)
                                  }
                                  className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                                    line.selectedSubId === q.subId
                                      ? 'bg-[#111111] text-white border-[#111111]'
                                      : 'bg-white border-[#E3E3DE] hover:border-[#FCAE1A]'
                                  }`}
                                >
                                  {q.subName} ({formatCurrencyExact(q.totalCents)})
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#5F5F5A]">
                              {line.selectedSubName ?? (line.pricingSource === 'fixed' ? 'Hand-entered fixed' : '—')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-[#3B3B38]">
                          {line.quantity.toLocaleString()} {line.unit}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-[#111111]">
                          {formatCurrencyExact(line.extendedCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
