'use client';

import type { MeDto, MembershipDto, Permission } from '@winou/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

const ORG_KEY = 'winou.currentOrg';

interface SessionValue {
  me: MeDto;
  org: MembershipDto;
  can: (p: Permission) => boolean;
  switchOrg: (orgId: string) => void;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [me, setMe] = useState<MeDto | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const m = await api<MeDto>('/auth/me');
    setMe(m);
    setOrgId((current) => {
      const wanted = current ?? readStoredOrg();
      return m.memberships.some((x) => x.orgId === wanted) ? wanted : (m.memberships[0]?.orgId ?? null);
    });
  }, []);

  useEffect(() => {
    void reload().catch(() => {});
  }, [reload]);

  const value = useMemo<SessionValue | null>(() => {
    if (!me) return null;
    const org = me.memberships.find((m) => m.orgId === orgId) ?? me.memberships[0];
    if (!org) return null;
    return {
      me,
      org,
      can: (p) => org.permissions.includes(p),
      switchOrg: (id) => {
        try {
          window.localStorage.setItem(ORG_KEY, id);
        } catch {
          /* storage unavailable: switch for this tab only */
        }
        setOrgId(id);
      },
      reload,
      signOut: async () => {
        await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
        window.location.href = '/login';
      },
    };
  }, [me, orgId, reload]);

  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Small data hook: loads on mount and when deps change; exposes reload. */
export function useApiData<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
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
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}
