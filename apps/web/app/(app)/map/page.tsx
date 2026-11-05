'use client';

import { VEHICLE_TYPES, type LiveStatus, type TripsReportDto, type VehicleType } from '@winou/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Plate } from '@/components/fleet-bits';
import { Icon } from '@/components/icons';
import type { Street } from '@/components/live-map';
import { ThemeToggle } from '@/components/theme-toggle';
import { DemoBadge, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { startOfDayTunis } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLiveVehicles, type LiveVehicle } from '@/lib/live';
import { SATELLITE_SOURCE } from '@/lib/map-credits';
import { useSession } from '@/lib/session';

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-2" />,
});

const KPIS = ['moving', 'stopped', 'offline'] as const;
type Kpi = (typeof KPIS)[number];
/** Status text colour; the status is always written out too, never shown by colour alone. */
const TONE: Record<LiveStatus, string> = {
  moving: 'text-moving',
  stopped: 'text-stopped',
  offline: 'text-offline',
  never: 'text-muted',
  no_device: 'text-muted',
};

export default function MapPage() {
  return (
    <Suspense>
      <MapView />
    </Suspense>
  );
}

function MapView() {
  const { t, formatRelative } = useI18n();
  const params = useSearchParams();
  const { org } = useSession();
  const { vehicles, connection, loaded, latestFix } = useLiveVehicles(org.orgId);
  const [q, setQ] = useState('');
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [status, setStatus] = useState<Kpi | 'all'>('all');
  // ?vehicle=<id> (from an alert's "Voir sur la carte") opens that vehicle.
  const [selectedId, setSelectedId] = useState<string | null>(params.get('vehicle'));
  const [street, setStreet] = useState<Street | null>(null);
  const route = useSelectedRoute(org.orgId, selectedId);

  const counts = useMemo(() => {
    const c = { moving: 0, stopped: 0, offline: 0 };
    for (const v of vehicles) if (v.status in c) c[v.status as Kpi]++;
    return c;
  }, [vehicles]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (type === 'all' || v.type === type) &&
        (status === 'all' || v.status === status) &&
        (!needle || v.name.toLowerCase().includes(needle) || v.plate.toLowerCase().replace(/\s/g, '').includes(needle.replace(/\s/g, '')) || v.device?.imei.includes(needle)),
    );
  }, [vehicles, q, type, status]);

  const selected = vehicles.find((v) => v.vehicleId === selectedId) ?? null;
  const label = useCallback(
    (v: LiveVehicle) => `${v.name}, ${t(`map.statuses.${v.status}`)}${v.position ? `, ${Math.round(v.position.speedKmh)} ${t('map.kmh')}` : ''}`,
    [t],
  );
  const select = useCallback((id: string) => {
    setSelectedId(id);
    // On phones and tablets the list is below the map: bring the map back into view.
    if (window.innerWidth < 1024) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('live-map')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    }
  }, []);

  return (
    <div className="fade-in flex flex-col gap-3.5 lg:h-[calc(100dvh-32px)]">
      <header className="flex flex-wrap items-center gap-2.5">
        <h1 className="h-display min-w-0 flex-[1_1_260px] text-[clamp(30px,3vw,44px)]">{t('map.title')}</h1>
        <label htmlFor="fleet-search" className="sr-only">
          {t('common.search')}
        </label>
        <div className="relative flex-[1_1_220px] sm:max-w-[280px]">
          <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-muted">
            <Icon name="search" size={18} />
          </span>
          <input
            id="fleet-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('map.searchPlaceholder')}
            className="h-11 w-full rounded-[14px] border-2 border-transparent bg-surface ps-10 pe-3.5 text-[15px] font-medium text-ink focus:border-acc focus:outline-none"
          />
        </div>
        <ThemeToggle desktopOnly />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 lg:flex-row">
        {/* Fleet */}
        <section aria-labelledby="fleet-title" className="order-2 flex min-h-0 flex-col gap-3 rounded-[20px] bg-surface p-3.5 lg:order-1 lg:w-[370px] lg:shrink-0">
          <h2 id="fleet-title" className="sr-only">
            {t('map.panelTitle')}
          </h2>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('map.statusFilter')}>
            {KPIS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(status === k ? 'all' : k)}
                aria-pressed={status === k}
                className={cx('rounded-2xl px-2.5 py-2 text-start transition-colors hover:bg-surface-2', status === k && 'bg-surface-2 ring-2 ring-ink ring-inset')}
              >
                <strong className={cx('h-display block text-[32px] tabular-nums', k === 'moving' && 'text-acc-text')}>{counts[k]}</strong>
                <span className="text-[13px] text-muted">{t(`map.kpis.${k}`)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('vehicles.type')}>
            <Pill on={type === 'all'} onClick={() => setType('all')}>
              {t('common.all')}
            </Pill>
            {VEHICLE_TYPES.map((vt) => (
              <Pill key={vt} on={type === vt} onClick={() => setType(vt)}>
                {t(`vehicles.typesPlural.${vt}`)}
              </Pill>
            ))}
          </div>
          <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1 lg:flex-1" aria-label={t('map.panelTitle')}>
            {!loaded && (
              <li role="status" className="px-3 py-6 text-center text-muted">
                {t('common.loading')}
              </li>
            )}
            {loaded && vehicles.length === 0 && (
              <li className="px-3 py-6 text-center text-muted">
                {t('map.noVehicles')}{' '}
                <Link href="/vehicles" className="font-bold text-ink underline underline-offset-4">
                  {t('vehicles.add')}
                </Link>
              </li>
            )}
            {loaded && vehicles.length > 0 && shown.length === 0 && <li className="px-3 py-6 text-center text-muted">{t('map.empty')}</li>}
            {shown.map((v) => (
              <li key={v.vehicleId}>
                <VehicleRow v={v} active={v.vehicleId === selectedId} onPick={select} />
              </li>
            ))}
          </ul>
        </section>

        {/* Map */}
        <section id="live-map" aria-label={t('nav.map')} className="relative order-1 flex scroll-mt-[72px] flex-col gap-3.5 sm:block lg:order-2 lg:min-h-0 lg:flex-1">
          <div className="relative h-[56dvh] min-h-[360px] overflow-hidden rounded-[20px] bg-surface-2 lg:h-full lg:min-h-0">
          <LiveMap vehicles={vehicles} selectedId={selectedId} onSelect={select} label={label} route={route} onStreet={setStreet} />
          <div className="pointer-events-none absolute start-3.5 top-3.5 flex flex-wrap items-center gap-2">
            {SATELLITE_SOURCE && <span className="pointer-events-auto">{/* Plan / Satellite: enabled once licensed imagery is configured */}</span>}
            <span role="status" aria-live="polite" className="flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold">
              <span aria-hidden className={cx('size-2 rounded-full', connection === 'live' ? 'bg-moving' : 'bg-attention')} />
              {connection === 'live' ? t('map.live') : t('map.reconnecting')}
              {latestFix && <span className="font-normal text-muted">· {formatRelative(latestFix)}</span>}
              {vehicles.some((v) => v.position?.source === 'simulator') && <DemoBadge />}
            </span>
          </div>
          </div>
          {selected && <SelectedCard key={selected.vehicleId} v={selected} street={street} onClose={() => setSelectedId(null)} />}
        </section>
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors max-lg:min-h-11', on ? 'bg-ink text-canvas' : 'bg-surface-2 text-ink hover:brightness-95')}
    >
      {children}
    </button>
  );
}

/** One fleet row. Memoized: a position update only re-renders the vehicle that moved. */
const VehicleRow = memo(
  function VehicleRow({ v, active, onPick }: { v: LiveVehicle; active: boolean; onPick: (id: string) => void }) {
    const { t, formatRelative } = useI18n();
    const speed = v.position ? Math.round(v.position.speedKmh) : 0;
    return (
      <button
        type="button"
        onClick={() => onPick(v.vehicleId)}
        aria-current={active || undefined}
        className={cx('grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[14px] px-2.5 py-2 text-start transition-colors hover:bg-surface-2', active && 'bg-surface-2')}
      >
        <span className={cx('grid size-[38px] place-items-center rounded-xl', active ? 'bg-acc text-on-acc' : 'bg-surface-2')}>
          <Icon name={v.type} />
        </span>
        <span className="min-w-0">
          <strong className="block truncate">{v.name}</strong>
          <span className="block truncate text-[13px] text-muted">
            <Plate plate={v.plate} format={v.plateFormat} />
          </span>
        </span>
        <span className="text-end">
          <strong className={cx('block text-sm', TONE[v.status])}>{t(`map.statuses.${v.status}`)}</strong>
          <span className="block text-[13px] text-muted tabular-nums">
            {v.status === 'moving' ? `${speed} ${t('map.kmh')}` : v.device?.lastSeenAt ? formatRelative(v.device.lastSeenAt) : t('common.none')}
          </span>
        </span>
      </button>
    );
  },
  (a, b) =>
    a.active === b.active &&
    a.onPick === b.onPick &&
    a.v.status === b.v.status &&
    a.v.name === b.v.name &&
    a.v.plate === b.v.plate &&
    a.v.device?.lastSeenAt === b.v.device?.lastSeenAt &&
    Math.round(a.v.position?.speedKmh ?? 0) === Math.round(b.v.position?.speedKmh ?? 0),
);

function SelectedCard({ v, street, onClose }: { v: LiveVehicle; street: Street | null; onClose: () => void }) {
  const { t, formatRelative, formatDateTime, formatTime } = useI18n();
  const p = v.position;
  const since = p ? (v.status === 'moving' ? p.movingSince : v.status === 'stopped' ? p.stoppedSince : null) : null;
  return (
    <aside
      aria-label={v.name}
      className="fade-in z-10 flex flex-col gap-3 rounded-[20px] bg-surface p-4 sm:absolute sm:end-3.5 sm:bottom-3.5 sm:max-h-[calc(100%-28px)] sm:w-[350px] sm:overflow-y-auto sm:p-[18px]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <strong className="h-display block truncate text-[23px]">{v.name}</strong>
          <span className="flex flex-wrap items-center gap-2 text-muted">
            <Plate plate={v.plate} format={v.plateFormat} />
            {p?.source === 'simulator' && <DemoBadge />}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label={t('map.closeDetails')} className="-me-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-[14px] text-muted hover:bg-surface-2">
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="-mt-1 flex flex-wrap items-baseline gap-x-2">
        <strong className={TONE[v.status]}>{t(`map.statuses.${v.status}`)}</strong>
        {since && <span className="text-[13px] text-muted">{t('map.since', { time: formatTime(since) })}</span>}
      </p>
      {street && (
        <div className="plaque">
          {street.ar && <b>{street.ar}</b>}
          <strong>{street.fr}</strong>
        </div>
      )}
      {p ? (
        <dl className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
          <Stat value={String(Math.round(p.speedKmh))} label={t('map.kmh')} />
          <Stat value={<time dateTime={p.recordedAt} title={formatDateTime(p.recordedAt)}>{formatRelative(v.device?.lastSeenAt ?? p.recordedAt)}</time>} label={t('map.lastUpdate')} small />
          <Stat value={v.device?.batteryPct != null ? `${v.device.batteryPct} %` : '—'} label={t('map.battery')} />
        </dl>
      ) : (
        <p className="text-muted">{t('map.noPosition')}</p>
      )}
      <Link
        href={`/trips?vehicle=${v.vehicleId}`}
        className="inline-flex min-h-12 items-center justify-center rounded-full bg-acc px-5 text-[15px] font-extrabold text-on-acc transition-[transform,filter] hover:-translate-y-0.5 hover:brightness-110"
      >
        {t('map.viewTrip')}
      </Link>
    </aside>
  );
}

function Stat({ value, label, small }: { value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div className="min-w-0">
      <dd className={cx('h-display tabular-nums', small ? 'pt-1 text-[15px] leading-tight' : 'truncate text-[25px]')}>{value}</dd>
      <dt className="text-[13px] text-muted">{label}</dt>
    </div>
  );
}

/** Today's trips of the selected vehicle (real routes from its positions), refreshed each minute. */
function useSelectedRoute(orgId: string, vehicleId: string | null) {
  const [route, setRoute] = useState<[number, number][][] | null>(null);
  useEffect(() => {
    setRoute(null);
    if (!vehicleId) return;
    let alive = true;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      const from = startOfDayTunis(new Date());
      const to = new Date(from.getTime() + 86_400_000);
      api<TripsReportDto>(`/orgs/${orgId}/vehicles/${vehicleId}/trips?from=${from.toISOString()}&to=${to.toISOString()}`)
        .then((r) => alive && setRoute(r.trips.map((x) => x.path)))
        .catch(() => alive && setRoute(null));
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [orgId, vehicleId]);
  return route;
}
