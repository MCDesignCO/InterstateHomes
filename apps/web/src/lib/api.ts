import type { UserRole } from '@interstate/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { role?: UserRole; subCompanyId?: string } = {}
): Promise<T> {
  const { role = 'estimator_approver', subCompanyId = 'sub-red-cliffs', headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'x-demo-role': role,
      'x-demo-sub-id': subCompanyId,
      ...(headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error(errBody.message ?? 'API request failed'), {
      status: res.status,
      data: errBody,
    });
  }

  return res.json() as Promise<T>;
}

export function formatCurrency(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatCurrencyExact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
