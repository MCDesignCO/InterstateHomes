'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, formatCurrency } from '@/lib/api';
import { useRole } from '@/lib/role-context';

interface HomeItem {
  id: string;
  homeCode: string;
  subdivisionCode: string;
  subdivisionName: string;
  lot: string;
  address: string;
  planName: string;
  elevation: string;
  garageHanding: string;
  finishedSqFt: number;
  garageSqFt: number;
  bedrooms: number;
  baths: number;
  stories: number;
  roofPitch: string;
  exteriorFinishMix: string;
  stage: string;
  planRevision: string;
  soldAmountCents: number | null;
}

export default function HomesPage() {
  const { role, subCompanyId } = useRole();
  const [homes, setHomes] = useState<HomeItem[]>([]);
  const [showIntake, setShowIntake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    subdivisionCode: 'CH',
    lot: '',
    address: '',
    planName: 'Zion 2450',
    elevation: 'Modern Desert',
    garageHanding: 'Right' as const,
    finishedSqFt: 2450,
    garageSqFt: 720,
    bedrooms: 4,
    baths: 3,
    stories: 1,
    roofPitch: '5:12',
    exteriorFinishMix: 'Stucco + Stone',
  });

  const loadHomes = () => {
    apiFetch<{ homes: HomeItem[] }>('/api/homes', { role, subCompanyId })
      .then((res) => setHomes(res.homes))
      .catch(() => {});
  };

  useEffect(() => {
    loadHomes();
  }, [role, subCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ home: HomeItem }>('/api/homes', {
        method: 'POST',
        role,
        subCompanyId,
        body: JSON.stringify(form),
      });
      setMessage(`Created ${res.home.homeCode} and initialized all 81 estimate cost codes.`);
      setShowIntake(false);
      setForm({ ...form, lot: '', address: '' });
      loadHomes();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to create home');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#111111]">Homes &amp; Plan Intake</h1>
          <p className="text-xs text-[#5F5F5A] mt-0.5">
            Section 5.1 — Record subdivision, lot, house specs, plan library link, and revisions.
          </p>
        </div>
        {(role === 'admin' || role === 'estimator_approver') && (
          <button
            onClick={() => setShowIntake((v) => !v)}
            className="px-4 py-2 rounded-md bg-[#FCAE1A] text-xs font-display font-bold text-[#111111] hover:bg-[#111111] hover:text-white transition-colors"
          >
            {showIntake ? 'Close Intake Form' : '+ New Plan Intake'}
          </button>
        )}
      </div>

      {message ? (
        <div className="bg-white border border-[#FCAE1A] text-xs px-4 py-2.5 rounded-md text-[#111111]">
          {message}
        </div>
      ) : null}

      {showIntake ? (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#E3E3DE] rounded-lg p-5 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-semibold mb-1">Subdivision</label>
            <select
              value={form.subdivisionCode}
              onChange={(e) => setForm({ ...form, subdivisionCode: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded px-3 py-2 text-sm"
            >
              <option value="CH">CH — Cottonwood Hollow</option>
              <option value="LK">LK — Lava Knolls</option>
              <option value="NS">NS — North Slope at Copper Rock</option>
              <option value="PS">PS — Park Side at Grandpa&apos;s Pond</option>
              <option value="ZV">ZV — Zion Vista</option>
              <option value="SH">SH — Sand Hollow</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Lot Number</label>
            <input
              required
              placeholder="e.g. 25"
              value={form.lot}
              onChange={(e) => setForm({ ...form, lot: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Street Address</label>
            <input
              required
              placeholder="e.g. 512 W Cottonwood Hollow Rd"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Plan Name (Library)</label>
            <input
              required
              value={form.planName}
              onChange={(e) => setForm({ ...form, planName: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Elevation</label>
            <input
              value={form.elevation}
              onChange={(e) => setForm({ ...form, elevation: e.target.value })}
              className="w-full border border-[#E3E3DE] rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Finished Sq Ft / Garage Sq Ft</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={form.finishedSqFt}
                onChange={(e) => setForm({ ...form, finishedSqFt: Number(e.target.value) })}
                className="w-1/2 border border-[#E3E3DE] rounded px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={form.garageSqFt}
                onChange={(e) => setForm({ ...form, garageSqFt: Number(e.target.value) })}
                className="w-1/2 border border-[#E3E3DE] rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="md:col-span-3 flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-[#111111] text-white text-xs font-display font-semibold hover:bg-[#FCAE1A] hover:text-[#111111]"
            >
              {submitting ? 'Saving...' : 'Create Home & Start Estimate'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="bg-white border border-[#E3E3DE] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E3E3DE] bg-[#F4F4F1] text-[10px] font-display uppercase tracking-wider text-[#5F5F5A]">
              <th className="py-3 px-4">Home ID</th>
              <th className="py-3 px-4">Subdivision &amp; Address</th>
              <th className="py-3 px-4">Plan &amp; Specs</th>
              <th className="py-3 px-4">Stage</th>
              <th className="py-3 px-4 text-right">Sold Price (Internal)</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E3E3DE] text-[13px]">
            {homes.map((h) => (
              <tr key={h.id} className="hover:bg-[#F4F4F1]/40">
                <td className="py-3 px-4 font-display font-bold text-[#111111] whitespace-nowrap">
                  {h.homeCode}
                  <div className="text-[11px] font-normal text-[#5F5F5A]">{h.planRevision}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="font-semibold text-[#111111]">{h.subdivisionName}</div>
                  <div className="text-xs text-[#5F5F5A]">{h.address}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium">
                    {h.planName} · {h.elevation}
                  </div>
                  <div className="text-xs text-[#5F5F5A] tabular-nums">
                    {h.finishedSqFt.toLocaleString()} sf + {h.garageSqFt.toLocaleString()} gar ·{' '}
                    {h.bedrooms}bd/{h.baths}ba · {h.roofPitch}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#F4F4F1] text-[#3B3B38]">
                    {h.stage.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-[#3B3B38]">
                  {formatCurrency(h.soldAmountCents)}
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <Link
                    href={`/estimates?homeId=${h.id}`}
                    className="text-xs font-semibold text-[#8A5A00] hover:underline"
                  >
                    Open Estimate →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
