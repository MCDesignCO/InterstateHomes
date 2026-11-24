'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch, formatCurrencyExact } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface QuoteItem {
  id: string;
  homeCode: string;
  subName: string;
  costCode: string;
  costCodeName: string;
  status: string;
  responseDeadline: string;
  quotedTotalCents: number;
  rounds: Array<{
    roundNumber: number;
    actorType: string;
    proposedTotalCents: number;
    proposedQuantity?: number;
    comment: string;
    createdAt: string;
  }>;
}

export default function QuotesPage() {
  const { role, subCompanyId } = useRole();
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadQuotes = () => {
    apiFetch<{ quotes: QuoteItem[] }>('/api/quotes', { role, subCompanyId })
      .then((res) => setQuotes(res.quotes))
      .catch(() => {});
  };

  useEffect(() => {
    loadQuotes();
  }, [role, subCompanyId]);

  const handleDecision = async (id: string, decision: 'accept' | 'reject') => {
    await apiFetch(`/api/quotes/${id}/decision`, {
      method: 'POST',
      role,
      subCompanyId,
      body: JSON.stringify({ decision }),
    });
    setFeedback(`Quote ${id} marked ${decision}.`);
    loadQuotes();
  };

  const handleSubCounter = async (quote: QuoteItem) => {
    await apiFetch(`/api/quotes/${quote.id}/counter`, {
      method: 'POST',
      role,
      subCompanyId,
      body: JSON.stringify({
        proposedTotalCents: quote.quotedTotalCents + 75_000,
        comment: 'Adjusted material surcharge (+$750) in subcontractor portal.',
      }),
    });
    setFeedback(`Counter-offer submitted on ${quote.homeCode} (${quote.costCode}).`);
    loadQuotes();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#111111]">Quotes &amp; Sub Approval</h1>
        <p className="text-xs text-[#5F5F5A] mt-0.5">
          Section 5.5 &amp; Rule 3 — Subcontractor approvals, counter-offers (&quot;money on the quote&quot;), and full round history.
        </p>
      </div>

      {feedback ? (
        <div className="bg-white border border-[#FCAE1A] px-4 py-2.5 rounded-md text-xs">{feedback}</div>
      ) : null}

      <div className="space-y-4">
        {quotes.map((q) => (
          <div key={q.id} className="bg-white border border-[#E3E3DE] rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-base text-[#111111]">
                    {q.homeCode} · {q.costCode} {q.costCodeName}
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#8A5A00]">
                    {q.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-[#5F5F5A] mt-0.5">
                  {q.subName} · Response deadline {q.responseDeadline}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-bold tabular-nums">
                  {formatCurrencyExact(q.quotedTotalCents)}
                </div>
                <div className="text-[11px] text-[#5F5F5A]">Initial quoted total</div>
              </div>
            </div>

            <div className="border border-[#E3E3DE] rounded-md divide-y divide-[#E3E3DE] bg-[#F4F4F1]/40">
              {q.rounds.map((r) => (
                <div key={r.roundNumber} className="px-4 py-2.5 flex flex-wrap justify-between gap-2 text-xs">
                  <div>
                    <span className="font-display font-bold uppercase text-[10px] mr-2 text-[#111111]">
                      Round {r.roundNumber} ({r.actorType})
                    </span>
                    <span className="text-[#3B3B38]">{r.comment}</span>
                  </div>
                  <div className="font-semibold tabular-nums">
                    {formatCurrencyExact(r.proposedTotalCents)}
                    {r.proposedQuantity ? ` (${r.proposedQuantity.toLocaleString()} qty)` : ''}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {role === 'subcontractor' && q.status === 'sent' && (
                <button
                  onClick={() => handleSubCounter(q)}
                  className="px-3.5 py-1.5 rounded bg-[#FCAE1A] text-xs font-display font-bold text-[#111111]"
                >
                  Submit Price Adjustment (+$750 Demo)
                </button>
              )}
              {(role === 'admin' || role === 'estimator_approver') &&
                q.status === 'sub_adjusted' && (
                  <>
                    <button
                      onClick={() => handleDecision(q.id, 'reject')}
                      className="px-3.5 py-1.5 rounded border border-[#E3E3DE] text-xs font-semibold hover:border-[#111111]"
                    >
                      Reject Adjustment
                    </button>
                    <button
                      onClick={() => handleDecision(q.id, 'accept')}
                      className="px-3.5 py-1.5 rounded bg-[#111111] text-white text-xs font-display font-semibold hover:bg-[#FCAE1A] hover:text-[#111111]"
                    >
                      Accept Adjustment
                    </button>
                  </>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
