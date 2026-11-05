import { liveStatus, type LiveEvent, type LiveStatus, type VehicleLiveDto } from '@winou/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { WS_URL } from './config';

export interface LiveVehicle extends VehicleLiveDto {
  status: LiveStatus;
}

export const STATUS_COLOR: Record<LiveStatus, string> = {
  moving: '#0E8A87',
  stopped: '#3F6EA8',
  offline: '#6B7785',
  never: '#94A0AE',
  no_device: '#94A0AE',
};

/** Snapshot, then live WebSocket updates; reconnects with backoff and when the app returns to the foreground. */
export function useLiveVehicles(orgId: string | undefined) {
  const [byId, setById] = useState(new Map<string, VehicleLiveDto>());
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [generation, setGeneration] = useState(0);

  const load = useCallback(async () => {
    if (!orgId) return;
    const list = await api<VehicleLiveDto[]>(`/orgs/${orgId}/live`);
    setById(new Map(list.map((v) => [v.vehicleId, v])));
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      try {
        await load();
        const { ticket } = await api<{ ticket: string }>(`/orgs/${orgId}/live/ticket`, { method: 'POST' });
        if (closed) return;
        ws = new WebSocket(`${WS_URL}/api/live/ws`);
        ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', ticket }));
        ws.onmessage = (m) => {
          const e = JSON.parse(String(m.data)) as LiveEvent;
          if (e.type === 'hello') {
            attempt = 0;
            setLive(true);
          } else if (e.type === 'vehicle') setById((prev) => new Map(prev).set(e.data.vehicleId, e.data));
        };
        ws.onclose = () => {
          setLive(false);
          if (!closed) schedule();
        };
      } catch {
        if (!closed) schedule();
      }
    };
    const schedule = () => {
      attempt++;
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    };
    void connect();
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(tick);
      ws?.close();
    };
  }, [orgId, load, generation]);

  // Back from the background: reconnect (the OS may have closed the socket).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setGeneration((g) => g + 1);
    });
    return () => sub.remove();
  }, []);

  const vehicles = useMemo<LiveVehicle[]>(
    () => [...byId.values()].map((v) => ({ ...v, status: liveStatus(v, now) })).sort((a, b) => a.name.localeCompare(b.name)),
    [byId, now],
  );
  return { vehicles, live, reload: load };
}
