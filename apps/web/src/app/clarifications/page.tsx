'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface Clarification {
  id: string;
  homeCode: string;
  costCode: string;
  costCodeName: string;
  category: string;
  title: string;
  status: string;
  ownerName: string;
  dueDate: string;
  messages: Array<{ author: string; body: string; createdAt: string }>;
}

export default function ClarificationsPage() {
  const { role, subCompanyId } = useRole();
  const [items, setItems] = useState<Clarification[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    apiFetch<{ clarifications: Clarification[] }>('/api/clarifications', { role, subCompanyId })
      .then((res) => setItems(res.clarifications))
      .catch(() => {});
  }, [role, subCompanyId]);

  const filtered = items.filter((i) => statusFilter === 'all' || i.status === statusFilter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#111111]">Clarification Log</h1>
          <p className="text-xs text-[#5F5F5A] mt-0.5">
            Section 5.10 — Filterable post-approval log for questions, scope gaps, plan conflicts, and price disputes.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[#E3E3DE] bg-white rounded-md px-3 py-2 text-xs font-semibold"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={item.id} className="bg-white border border-[#E3E3DE] rounded-lg p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#F4F4F1]">
                  {item.homeCode} · {item.costCode}
                </span>
                <span className="font-display font-bold text-sm text-[#111111]">{item.title}</span>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#8A5A00]">
                {item.status} · Due {item.dueDate}
              </span>
            </div>
            <div className="text-xs text-[#5F5F5A]">
              Category: {item.category.replace('_', ' ')} · Owner: {item.ownerName}
            </div>
            {item.messages.map((m, idx) => (
              <div key={idx} className="bg-[#F4F4F1]/60 rounded px-3 py-2 text-xs">
                <span className="font-semibold text-[#111111]">{m.author}:</span> {m.body}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
