'use client';

import { VEHICLE_TYPES, type LiveStatus, type VehicleType } from '@winou/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Plate } from '@/components/fleet-bits';
import { STATUS_COLOR } from '@/components/live-map';
import { Badge, Chip, DemoBadge, Input, cx } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useLiveVehicles, type LiveVehicle } from '@/lib/live';
import { useSession } from '@/lib/session';

const LiveMap = dynamic(() => import('@/components/live-map').then((m) => m.LiveMap), { ssr: false });

const STATUS_FILTERS: LiveStatus[] = ['moving', 'stopped', 'offline'];
const TONE: Record<LiveStatus, 'moving' | 'stopped' | 'offline' | 'neutral'> = {
  moving: 'moving',
  stopped: 'stopped',
  offline: 'offline',
  never: 'neutral',
  no_device: 'neutral',
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
  const [status, setStatus] = useState<LiveStatus | 'all'>('all');
  // ?vehicle=<id> (from an alert's "Voir sur la carte") opens that vehicle.
  const [selectedId, setSelectedId] = useState<string | null>(params.get('vehicle'));

  const counts = useMemo(() => {
    const c = { moving: 0, stopped: 0, offline: 0 };
    for (const v of vehicles) if (v.status in c) c[v.status as keyof typeof c]++;
    return c;
  }, [vehicles]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (type === 'all' || v.type === type) &&
        (status === 'all' || v.status === status) &&
        (!needle || v.name.toLowerCase().includes(needle) || v.plate.toLowerCase().includes(needle) || v.device?.imei.includes(needle)),
    );
  }, [vehicles, q, type, status]);

  const selected = vehicles.find((v) => v.vehicleId === selectedId) ?? null;
  const ago = (iso: string | null | undefined) => (iso ? formatRelative(iso) : t('common.none'));
  const label = useCallback(
    (v: LiveVehicle) =>
      `${v.name}, ${t(`map.statuses.${v.status}`)}${v.position ? `, ${Math.round(v.position.speedKmh)} ${t('map.kmh')}` : ''}`,
    [t],
  );

  return (
    <div className="-mx-4 -my-6 grid h-auto sm:-mx-8 lg:-mx-10 lg:-my-10 lg:h-dvh lg:grid-cols-[400px_1fr]">
      {/* Fleet panel */}
      <section aria-labelledby="fleet-title" className="order-2 flex min-h-0 flex-col bg-white lg:order-1 lg:border-e lg:border-line">
        <div className="px-5 pt-6 pb-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 id="fleet-title" className="text-3xl font-extrabold tracking-tight">
              {t('map.panelTitle')}
            </h1>
            <ConnectionBadge connection={connection} />
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(['moving', 'stopped', 'offline'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(status === k ? 'all' : k)}
                aria-pressed={status === k}
                className={cx(
                  'rounded-xl px-3 py-3 text-start transition-colors',
                  k === 'offline' && counts.offline > 0 ? 'bg-attention-bg text-attention' : 'bg-canvas',
                  status === k && 'outline-2 outline-navy outline-solid',
                )}
              >
                <span className="block text-2xl font-extrabold tabular-nums">{counts[k]}</span>
                <span className={cx('text-sm', !(k === 'offline' && counts.offline > 0) && 'text-muted')}>{t(`map.kpis.${k}`)}</span>
              </button>
            ))}
          </div>
          <label htmlFor="fleet-search" className="mb-1.5 block text-sm font-medium text-muted">
            {t('common.search')}
          </label>
          <Input id="fleet-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('map.searchPlaceholder')} />
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('vehicles.type')}>
            <Chip active={type === 'all'} onClick={() => setType('all')}>
              {t('common.all')}
            </Chip>
            {VEHICLE_TYPES.map((vt) => (
              <Chip key={vt} active={type === vt} onClick={() => setType(vt)}>
                {t(`vehicles.typesPlural.${vt}`)}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('map.statusFilter')}>
            {STATUS_FILTERS.map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? 'all' : s)}>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                  {t(`map.statuses.${s}`)}
                </span>
              </Chip>
            ))}
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line" aria-label={t('map.panelTitle')}>
          {loaded && shown.length === 0 && <li className="px-5 py-8 text-center text-muted">{t('map.empty')}</li>}
          {shown.map((v) => {
            const active = v.vehicleId === selectedId;
            return (
              <li key={v.vehicleId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.vehicleId)}
                  aria-current={active || undefined}
                  aria-label={t('map.showOnMap', { name: v.name })}
                  className={cx('flex w-full items-start gap-3 border-b border-line px-5 py-3.5 text-start hover:bg-canvas', active && 'bg-canvas')}
                >
                  <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[v.status] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{v.name}</span>
                    <span className="block truncate text-sm text-muted">
                      <Plate plate={v.plate} format={v.plateFormat} /> · {t(`vehicles.types.${v.type}`)}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-semibold" style={{ color: STATUS_COLOR[v.status] }}>
                      {t(`map.statuses.${v.status}`)}
                    </span>
                    <span className="block text-sm text-muted tabular-nums">
                      {v.status === 'moving' && v.position ? `${Math.round(v.position.speedKmh)} ${t('map.kmh')}` : ago(v.device?.lastSeenAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Map */}
      <section className="relative order-1 h-[58dvh] lg:order-2 lg:h-full" aria-label={t('nav.map')}>
        <LiveMap vehicles={vehicles} selectedId={selectedId} onSelect={setSelectedId} label={label} />
        <div className="pointer-events-none absolute start-3 top-3 flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[15px] font-medium shadow-sm">
          {latestFix ? t('map.headline', { count: vehicles.length, ago: formatRelative(latestFix) }) : t('map.headlineNever', { count: vehicles.length })}
          {vehicles.some((v) => v.position?.source === 'simulator') && <DemoBadge />}
        </div>
        {selected && <DetailsCard v={selected} onClose={() => setSelectedId(null)} />}
      </section>
    </div>
  );
}

function ConnectionBadge({ connection }: { connection: 'connecting' | 'live' | 'reconnecting' }) {
  const { t } = useI18n();
  return (
    <span role="status" aria-live="polite">
      {connection === 'live' ? <Badge tone="moving">{t('map.live')}</Badge> : <Badge tone="attention">{t('map.reconnecting')}</Badge>}
    </span>
  );
}

function DetailsCard({ v, onClose }: { v: LiveVehicle; onClose: () => void }) {
  const { t, formatRelative, formatDateTime, formatTime } = useI18n();
  const p = v.position;
  const since = p ? (v.status === 'moving' ? p.movingSince : v.status === 'stopped' ? p.stoppedSince : null) : null;
  return (
    <div
      role="region"
      aria-label={v.name}
      className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-white p-5 shadow-xl sm:start-auto sm:end-4 sm:bottom-6 sm:w-[400px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold leading-tight">{v.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-muted">
            <Plate plate={v.plate} format={v.plateFormat} />
            {p?.source === 'simulator' && <DemoBadge />}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('map.closeDetails')} className="-me-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas">
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-3">
        <Badge tone={TONE[v.status]}>
          {t(`map.statuses.${v.status}`)}
          {since ? ` · ${t('map.since', { time: formatTime(since) })}` : ''}
        </Badge>
      </div>
      <hr className="my-4 border-line" />
      {p ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Item label={t('map.speed')} value={`${Math.round(p.speedKmh)} ${t('map.kmh')}`} />
          <Item label={t('map.lastUpdate')} value={<time dateTime={p.recordedAt} title={formatDateTime(p.recordedAt)}>{formatRelative(v.device?.lastSeenAt ?? p.recordedAt)}</time>} />
          <Item label={t('map.battery')} value={v.device?.batteryPct != null ? `${v.device.batteryPct} %` : t('common.none')} />
          <Item label={t('map.device')} value={<span className="ltr-isolate tabular-nums">{v.device?.imei ?? t('common.none')}</span>} />
          <Item label={t('map.position')} value={<span className="ltr-isolate tabular-nums">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</span>} wide />
        </dl>
      ) : (
        <p className="text-muted">{t('map.noPosition')}</p>
      )}
      <Link
        href={`/trips?vehicle=${v.vehicleId}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-navy px-4 text-[15px] font-semibold text-white hover:bg-navy-soft"
      >
        {t('map.viewTrip')}
      </Link>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-[17px] font-bold">{value}</dd>
    </div>
  );
}
