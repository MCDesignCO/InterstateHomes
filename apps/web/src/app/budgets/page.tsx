'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, formatCurrencyExact } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface BudgetResponse {
  budgets: Array<{
    homeId: string;
    homeCode: string;
    planName: string;
    stage: string;
    estimateVersion: number;
    canApprove: boolean;
    blockingCostCodes: Array<{ costCode: string; reason: string }>;
    totalEstimatedCents: number;
    totalSignedPoCents: number;
    totalFixedCents: number;
    totalFinalBudgetCents: number;
    totalVarianceCents: number;
  }>;
  liveJobCostRows: Array<{
    homeCode: string;
    costCode: string;
    costCodeName: string;
    budgetCents: number;
    source: string;
    loadedAt: string;
  }>;
}

export default function BudgetsPage() {
  const { role, subCompanyId } = useRole();
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    apiFetch<BudgetResponse>('/api/budgets', { role, subCompanyId })
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, [role, subCompanyId]);

  const handleApprove = async (homeId: string) => {
    setMessage(null);
    try {
      const res = await apiFetch<{ rowsWritten: number }>(`/api/budgets/${homeId}/approve`, {
        method: 'POST',
        role,
        subCompanyId,
      });
      setMessage(`Approved budget and wrote ${res.rowsWritten} live job cost rows.`);
      load();
    } catch (err: unknown) {
      const e = err as Error & { data?: { blockingCostCodes?: Array<{ reason: string }> } };
      setMessage(
        `${e.message} ${e.data?.blockingCostCodes?.[0]?.reason ?? ''}`
      );
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#111111]">
          Budget Build &amp; Live Job Cost Handoff
        </h1>
        <p className="text-xs text-[#5F5F5A] mt-0.5">
          Section 5.7, 5.9 &amp; 11 — Final budget = Signed POs + Fixed amounts. Approval writes
          one row per cost code (as text) directly to <code>job_cost_budgets</code>.
        </p>
      </div>

      {message ? (
        <div className="bg-white border border-[#FCAE1A] px-4 py-2.5 rounded-md text-xs">
          {message}
        </div>
      ) : null}

      <div className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase text-[#5F5F5A]">
              <th className="py-3 px-4">Home</th>
              <th className="py-3 px-3 text-right">Approved Estimate</th>
              <th className="py-3 px-3 text-right">Signed POs</th>
              <th className="py-3 px-3 text-right">Fixed Amounts</th>
              <th className="py-3 px-3 text-right">Final Budget</th>
              <th className="py-3 px-3 text-right">Variance</th>
              <th className="py-3 px-4 text-right">Live Handoff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3DE]">
            {(data?.budgets ?? []).map((b) => (
              <tr key={b.homeId} className="hover:bg-[#F4F4F1]/40">
                <td className="py-3 px-4">
                  <div className="font-display font-bold text-[#111111]">{b.homeCode}</div>
                  <div className="text-[#5F5F5A]">
                    {b.planName} · v{b.estimateVersion}
                  </div>
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {formatCurrencyExact(b.totalEstimatedCents)}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {formatCurrencyExact(b.totalSignedPoCents)}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {formatCurrencyExact(b.totalFixedCents)}
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-bold">
                  {formatCurrencyExact(b.totalFinalBudgetCents)}
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {formatCurrencyExact(b.totalVarianceCents)}
                </td>
                <td className="py-3 px-4 text-right">
                  {b.stage === 'live_budget' ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] font-semibold">
                      Live in Job Cost
                    </span>
                  ) : (role === 'admin' || role === 'estimator_approver') ? (
                    <button
                      onClick={() => handleApprove(b.homeId)}
                      className="px-3 py-1.5 rounded bg-[#111111] text-white font-display font-semibold hover:bg-[#FCAE1A] hover:text-[#111111]"
                    >
                      Approve &amp; Write Live
                    </button>
                  ) : (
                    <span className="text-[#5F5F5A]">Pending Approver</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live Job Cost Budget Table Preview (Section 11) */}
      <div className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E3E3DE] flex items-center justify-between">
          <h2 className="text-sm font-display font-bold">
            Live <code>job_cost_budgets</code> Table (Section 11 Schema)
          </h2>
          <span className="text-xs text-[#5F5F5A]">
            {data?.liveJobCostRows.length ?? 0} rows
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase text-[#5F5F5A]">
              <th className="py-2.5 px-4">Home</th>
              <th className="py-2.5 px-3">Code (Text)</th>
              <th className="py-2.5 px-3">Name</th>
              <th className="py-2.5 px-3 text-right">Budget</th>
              <th className="py-2.5 px-3">Source</th>
              <th className="py-2.5 px-4">Loaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3DE]">
            {(data?.liveJobCostRows ?? []).map((row, idx) => (
              <tr key={`${row.homeCode}-${row.costCode}-${idx}`}>
                <td className="py-2.5 px-4 font-semibold">{row.homeCode}</td>
                <td className="py-2.5 px-3 font-mono font-bold">{row.costCode}</td>
                <td className="py-2.5 px-3">{row.costCodeName}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                  {formatCurrencyExact(row.budgetCents)}
                </td>
                <td className="py-2.5 px-3">{row.source}</td>
                <td className="py-2.5 px-4 text-[#5F5F5A]">
                  {new Date(row.loadedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
