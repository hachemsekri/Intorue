'use client';

import type { ApiErrorDto } from '@winou/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: ApiErrorDto['issues'] = [],
  ) {
    super(code);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-winou-csrf': '1', 'content-type': 'application/json' },
    body: '{}',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

/**
 * Same-origin JSON client. Cookies carry the session; the CSRF header is always sent.
 * On 401 it refreshes the session once and retries, then sends the user to sign-in.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        'x-winou-csrf': '1',
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/login')) {
    if (await refreshSession()) return api<T>(path, init, false);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorDto>;
    throw new ApiError(res.status, err.code ?? 'generic', err.issues);
  }
  return data as T;
}
