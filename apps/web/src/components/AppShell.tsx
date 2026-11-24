'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  Calculator,
  FileText,
  FileSignature,
  DollarSign,
  MessageSquareWarning,
  Users,
  ShieldAlert,
  Sheet,
  ListOrdered,
  Settings,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { ROLE_LABELS, type UserRole } from '@interstate/shared';
import { InterstateLogo } from './InterstateLogo';
import { useRole } from '@/lib/role-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: 'amber' | 'red';
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, setRole, authMode, user, authenticated, loading, logout } = useRole();
  const [signingOut, setSigningOut] = useState(false);

  const isAuthRoute = pathname === '/login' || pathname.startsWith('/login/');

  useEffect(() => {
    if (!isAuthRoute && !loading && authMode === 'postgres' && !authenticated) {
      router.replace('/login');
    }
  }, [isAuthRoute, loading, authMode, authenticated, router]);

  // Do not wrap /login in the sidebar AppShell
  if (isAuthRoute) {
    return <>{children}</>;
  }

  // Prevent flashing protected content or firing unauthenticated API calls while checking session
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F4F1] text-[#111111] gap-4">
        <InterstateLogo variant="light" />
        <div className="text-xs font-display uppercase tracking-[0.14em] text-[#5F5F5A]">
          Verifying session…
        </div>
      </div>
    );
  }

  if (!loading && authMode === 'postgres' && !authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F4F1] text-[#111111] gap-4">
        <InterstateLogo variant="light" />
        <div className="text-xs font-display uppercase tracking-[0.14em] text-[#5F5F5A]">
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  const internalGroups: NavGroup[] = [
    {
      heading: 'ESTIMATING',
      items: [
        { label: 'Dashboard', href: '/', icon: LayoutDashboard },
        { label: 'Homes & Plans', href: '/homes', icon: Home },
        { label: 'Estimates', href: '/estimates', icon: Calculator },
        { label: 'Quotes & Review', href: '/quotes', icon: FileText, badge: 1, badgeTone: 'amber' },
      ],
    },
    {
      heading: 'SUBCONTRACTS',
      items: [
        { label: 'Purchase Orders', href: '/purchase-orders', icon: FileSignature },
        { label: 'Budgets', href: '/budgets', icon: DollarSign },
        { label: 'Clarifications', href: '/clarifications', icon: MessageSquareWarning, badge: 1, badgeTone: 'amber' },
      ],
    },
    {
      heading: 'VENDORS',
      items: [
        { label: 'Subcontractors', href: '/subcontractors', icon: Users },
        { label: 'Compliance', href: '/compliance', icon: ShieldAlert, badge: 1, badgeTone: 'red' },
        { label: 'Price Sheets', href: '/price-sheets', icon: Sheet },
      ],
    },
    {
      heading: 'SETUP',
      items: [
        { label: 'Cost Codes (81)', href: '/cost-codes', icon: ListOrdered },
        { label: 'Users, Settings & Audit', href: '/admin', icon: Settings },
      ],
    },
  ];

  const subPortalGroups: NavGroup[] = [
    {
      heading: 'SUBCONTRACTOR PORTAL',
      items: [
        { label: 'Portal Overview', href: '/portal', icon: LayoutDashboard },
        { label: 'My Quotes', href: '/quotes', icon: FileText, badge: 1, badgeTone: 'amber' },
        { label: 'POs & Agreements', href: '/purchase-orders', icon: FileSignature },
        { label: 'Price Sheets', href: '/price-sheets', icon: Sheet },
        { label: 'Compliance Docs', href: '/compliance', icon: ShieldAlert },
        { label: 'Clarifications', href: '/clarifications', icon: MessageSquareWarning },
      ],
    },
  ];

  const groups = role === 'subcontractor' ? subPortalGroups : internalGroups;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F4F4F1] text-[#111111]">
      {/* Dark #111111 Sidebar matching Interstate Rock wireframe + myinterstatehome.com */}
      <aside className="w-60 shrink-0 bg-[#111111] text-white flex flex-col justify-between border-r border-[#2C2C2A]">
        <div>
          <div className="px-5 pt-5 pb-4 border-b border-[#2C2C2A]">
            <InterstateLogo variant="dark" />
            <div className="text-[11px] text-[#9D9D97] mt-2 tracking-wide">
              Estimating &amp; Budgets
            </div>
          </div>

          <nav className="px-3 py-4 space-y-5">
            {groups.map((group) => (
              <div key={group.heading}>
                <div className="px-2.5 mb-1.5 text-[10px] font-display font-semibold tracking-[0.12em] text-[#9D9D97]">
                  {group.heading}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-md text-[13px] transition-colors ${
                            active
                              ? 'bg-[#262624] text-white font-semibold border-l-2 border-[#FCAE1A]'
                              : 'text-[#C9CED8] hover:bg-[#1C1C1A] hover:text-white'
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon className="w-4 h-4 opacity-80" />
                            <span>{item.label}</span>
                          </span>
                          {item.badge ? (
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                                item.badgeTone === 'red'
                                  ? 'bg-[#7F1D1D] text-[#FECACA]'
                                  : 'bg-[#FCAE1A]/20 text-[#FCAE1A]'
                              }`}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer: Authenticated Session Panel (Postgres mode) OR Role Preview Switcher (Demo mode) */}
        {authMode === 'postgres' && user ? (
          <div className="p-3.5 border-t border-[#2C2C2A] bg-[#0B0B0A] space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user.fullName}</div>
                <div className="text-[11px] text-[#9D9D97] truncate">{user.email}</div>
              </div>
              {user.mfaEnabled ? (
                <span
                  title="MFA Protected Session"
                  className="shrink-0 inline-flex items-center text-[#FCAE1A]"
                >
                  <ShieldCheck className="w-4 h-4" />
                </span>
              ) : null}
            </div>
            <div className="inline-block text-[10px] font-display uppercase tracking-[0.08em] px-2 py-0.5 rounded bg-[#1C1C1A] border border-[#2C2C2A] text-[#FCAE1A]">
              {ROLE_LABELS[user.role] ?? user.role}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 rounded text-xs font-semibold bg-[#1C1C1A] hover:bg-[#262624] border border-[#2C2C2A] text-[#E3E3DE] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{signingOut ? 'Signing out…' : 'Sign Out'}</span>
            </button>
          </div>
        ) : (
          <div className="p-3.5 border-t border-[#2C2C2A] bg-[#0B0B0A]">
            <label className="block text-[10px] font-display uppercase tracking-[0.1em] text-[#9D9D97] mb-1.5">
              Active Role View
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-[#1C1C1A] border border-[#2C2C2A] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FCAE1A]"
            >
              <option value="estimator_approver">{ROLE_LABELS.estimator_approver}</option>
              <option value="project_manager">{ROLE_LABELS.project_manager}</option>
              <option value="subcontractor">{ROLE_LABELS.subcontractor}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
            </select>
            <div className="mt-2 text-[10px] text-[#9D9D97]">
              {role === 'project_manager' && 'Profit, land & margin hidden (Sec 4)'}
              {role === 'subcontractor' && 'Scoped to Red Cliffs Drywall'}
              {role === 'estimator_approver' && 'Full estimating & PO approval'}
              {role === 'admin' && 'Full system & audit access'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
