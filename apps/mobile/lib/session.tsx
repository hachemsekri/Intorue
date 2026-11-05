import type { MeDto, MembershipDto, Permission } from '@winou/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, hasSession, login as apiLogin, logout as apiLogout, setSignedOutHandler } from './api';
import { prefs } from './storage';
import { unregisterPush } from './push';

const ORG_KEY = 'winou.org';

interface SessionValue {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: MeDto | null;
  org: MembershipDto | null;
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchOrg: (id: string) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [me, setMe] = useState<MeDto | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const m = await api<MeDto>('/auth/me');
    const saved = await prefs.getItem(ORG_KEY);
    setMe(m);
    setOrgId(m.memberships.some((x) => x.orgId === saved) ? saved : (m.memberships[0]?.orgId ?? null));
    setStatus('signedIn');
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => {
      setMe(null);
      setStatus('signedOut');
    });
    void (async () => {
      if (!(await hasSession())) return setStatus('signedOut');
      try {
        await load();
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [load]);

  const org = me?.memberships.find((m) => m.orgId === orgId) ?? me?.memberships[0] ?? null;
  const value: SessionValue = {
    status,
    me,
    org,
    can: (p) => !!org?.permissions.includes(p),
    signIn: async (email, password) => {
      await apiLogin(email, password);
      await load();
    },
    signOut: async () => {
      await unregisterPush().catch(() => {});
      await apiLogout();
      setMe(null);
      setStatus('signedOut');
    },
    switchOrg: async (id) => {
      await prefs.setItem(ORG_KEY, id);
      setOrgId(id);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Loads `path` (null = skip), with reload and pull-to-refresh state. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
