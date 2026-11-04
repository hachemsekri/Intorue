'use client';

import { liveStatus, type LiveEvent, type LiveStatus, type VehicleLiveDto } from '@winou/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';

const WS_BASE = process.env.NEXT_PUBLIC_API_WS_URL ?? 'ws://localhost:4000';

export type Connection = 'connecting' | 'live' | 'reconnecting';
export interface LiveVehicle extends VehicleLiveDto {
  status: LiveStatus;
}

/**
 * Snapshot over HTTP, then updates over the live WebSocket. Reconnects with backoff and
 * reloads the snapshot after a reconnect so nothing is missed.
 */
export function useLiveVehicles(orgId: string) {
  const [byId, setById] = useState<Map<string, VehicleLiveDto>>(new Map());
  const [connection, setConnection] = useState<Connection>('connecting');
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadSnapshot = useCallback(async () => {
    const list = await api<VehicleLiveDto[]>(`/orgs/${orgId}/live`);
    setById(new Map(list.map((v) => [v.vehicleId, v])));
    setLoaded(true);
  }, [orgId]);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        await loadSnapshot();
        const { ticket } = await api<{ ticket: string }>(`/orgs/${orgId}/live/ticket`, { method: 'POST' });
        if (closed) return;
        const ws = new WebSocket(`${WS_BASE}/api/live/ws`);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket }));
        ws.onmessage = (m) => {
          const e = JSON.parse(String(m.data)) as LiveEvent;
          if (e.type === 'hello') {
            attempt = 0;
            setConnection('live');
          } else if (e.type === 'vehicle') {
            setById((prev) => new Map(prev).set(e.data.vehicleId, e.data));
            setLastEventAt(new Date());
          }
        };
        ws.onclose = () => {
          if (closed) return;
          setConnection('reconnecting');
          schedule();
        };
      } catch {
        if (!closed) {
          setConnection('reconnecting');
          schedule();
        }
      }
    }
    function schedule() {
      attempt++;
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    }

    void connect();
    const tick = setInterval(() => setNow(new Date()), 10_000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(tick);
      wsRef.current?.close();
    };
  }, [orgId, loadSnapshot]);

  const vehicles = useMemo<LiveVehicle[]>(
    () => [...byId.values()].map((v) => ({ ...v, status: liveStatus(v, now) })).sort((a, b) => a.name.localeCompare(b.name)),
    [byId, now],
  );
  const latestFix = useMemo(() => {
    const times = vehicles.map((v) => v.position?.recordedAt).filter((x): x is string => !!x);
    return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
  }, [vehicles]);

  return { vehicles, connection, loaded, now, latestFix, lastEventAt };
}
