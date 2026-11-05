import type { ApiErrorDto, AuthTokensDto } from '@winou/shared';
import { API_URL } from './config';
import { getItem, removeItem, setItem } from './storage';

const ACCESS = 'winou.access';
const REFRESH = 'winou.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: ApiErrorDto['issues'] = [],
  ) {
    super(code);
  }
}

let onSignedOut: () => void = () => {};
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

export async function saveTokens(t: AuthTokensDto) {
  await setItem(ACCESS, t.accessToken);
  await setItem(REFRESH, t.refreshToken);
}
export async function clearTokens() {
  await removeItem(ACCESS);
  await removeItem(REFRESH);
}
export const hasSession = async () => !!(await getItem(REFRESH));

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const token = await getItem(REFRESH);
    if (!token) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) return false;
      await saveTokens((await res.json()) as AuthTokensDto);
      return true;
    } catch {
      return false;
    }
  })().finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

/** Bearer-authenticated JSON client; refreshes the session once on 401. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}, retry = true): Promise<T> {
  const access = init.auth === false ? null : await getItem(ACCESS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(access ? { authorization: `Bearer ${access}` } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 401 && retry && init.auth !== false) {
    if (await refresh()) return api<T>(path, init, false);
    await clearTokens();
    onSignedOut();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = (data ?? {}) as Partial<ApiErrorDto>;
    throw new ApiError(res.status, e.code ?? 'generic', e.issues);
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const tokens = await api<AuthTokensDto>('/auth/login', { method: 'POST', body: { email, password, client: 'mobile' }, auth: false });
  await saveTokens(tokens);
}

export async function logout() {
  const token = await getItem(REFRESH);
  if (token) await api('/auth/logout', { method: 'POST', body: { refreshToken: token }, auth: false }).catch(() => {});
  await clearTokens();
}
