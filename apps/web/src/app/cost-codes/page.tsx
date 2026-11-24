'use client';

import React, { useState } from 'react';
import { COST_CLASSIFICATIONS, COST_CODES } from '@interstate/shared';

export default function CostCodesPage() {
  const [search, setSearch] = useState('');
  const [clsFilter, setClsFilter] = useState('all');

  const filtered = COST_CODES.filter((cc) => {
    if (clsFilter !== 'all' && cc.classificationCode !== clsFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      cc.code.toLowerCase().includes(q) ||
      cc.name.toLowerCase().includes(q) ||
      cc.estimateBuiltFrom.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#111111]">
            Master Cost Codes ({COST_CODES.length} Codes / {COST_CLASSIFICATIONS.length} Classifications)
          </h1>
          <p className="text-xs text-[#5F5F5A] mt-0.5">
            Section 7 &amp; Business Rule 12 — Stored strictly as text everywhere (e.g. &quot;03&quot;, &quot;00L&quot;).
          </p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Filter code or trade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-[#E3E3DE] bg-white rounded-md px-3 py-1.5 text-xs"
          />
          <select
            value={clsFilter}
            onChange={(e) => setClsFilter(e.target.value)}
            className="border border-[#E3E3DE] bg-white rounded-md px-3 py-1.5 text-xs"
          >
            <option value="all">All 11 Classifications</option>
            {COST_CLASSIFICATIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase text-[#5F5F5A]">
              <th className="py-2.5 px-4">Code</th>
              <th className="py-2.5 px-3">Classification</th>
              <th className="py-2.5 px-3">Line Item</th>
              <th className="py-2.5 px-3">Pricing Sources</th>
              <th className="py-2.5 px-3">Visibility</th>
              <th className="py-2.5 px-4">Allowed Sub-Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3DE]">
            {filtered.map((cc) => (
              <tr key={cc.code} className="hover:bg-[#F4F4F1]/40">
                <td className="py-2.5 px-4 font-mono font-bold">{cc.code}</td>
                <td className="py-2.5 px-3 text-[#5F5F5A]">
                  {cc.classificationCode} {cc.classificationName}
                </td>
                <td className="py-2.5 px-3 font-semibold text-[#111111]">{cc.name}</td>
                <td className="py-2.5 px-3 uppercase text-[10px] font-semibold">
                  {cc.pricingSources.join(' / ')}
                </td>
                <td className="py-2.5 px-3">
                  {cc.isInternalOnly ? (
                    <span className="px-2 py-0.5 rounded bg-[#111111] text-[#FCAE1A] text-[10px] font-semibold">
                      Internal Only
                    </span>
                  ) : (
                    <span className="text-[#5F5F5A]">Standard</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-[#5F5F5A]">
                  {cc.allowedSubLines.join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
