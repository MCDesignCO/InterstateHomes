import type { UserRole } from '@interstate/shared';

function buildApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const apiPath =
    normalized.startsWith('/api/') || normalized === '/api' ? normalized : `/api${normalized}`;

  // Server-side callers (if any) hit the internal API directly; browser callers always
  // use same-origin /api/* routed through Next.js runtime proxy (zero CORS, single image).
  if (typeof window === 'undefined') {
    const origin = (
      process.env.API_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000'
    ).replace(/\/+$/, '');
    return `${origin}${apiPath}`;
  }

  return apiPath;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { role?: UserRole; subCompanyId?: string } = {}
): Promise<T> {
  const { role = 'estimator_approver', subCompanyId = 'sub-red-cliffs', headers, ...rest } = options;

  const requestHeaders = new Headers(headers);
  if (rest.body !== undefined && !(rest.body instanceof FormData) && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (!requestHeaders.has('x-demo-role')) {
    requestHeaders.set('x-demo-role', role);
  }
  if (!requestHeaders.has('x-demo-sub-id')) {
    requestHeaders.set('x-demo-sub-id', subCompanyId);
  }

  const res = await fetch(buildApiUrl(path), {
    ...rest,
    credentials: 'include',
    headers: requestHeaders,
    cache: 'no-store',
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText }));
    throw Object.assign(new Error(errBody.message ?? errBody.error ?? 'API request failed'), {
      status: res.status,
      data: errBody,
    });
  }

  if (res.status === 204) {
    return undefined as T;
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
