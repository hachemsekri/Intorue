'use client';

import type { AlertDto, TripsReportDto, VehicleDto } from '@winou/shared';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAlertText } from '@/components/alert-text';
import { Plate } from '@/components/fleet-bits';
import { Button, Chip, EmptyState, Field, Input, Notice, Select, cx, useErrorText } from '@/components/ui';
import { formatDistance, formatDuration, fromYmdTunis, startOfDayTunis, ymdTunis } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

const TripMap = dynamic(() => import('@/components/trip-map').then((m) => m.TripMap), { ssr: false });

type Period = 'today' | 'yesterday' | 'last7' | 'custom';
const DAY = 86_400_000;

export default function TripsPage() {
  return (
    <Suspense>
      <TripsView />
    </Suspense>
  );
}

function TripsView() {
  const { t, locale, formatTime, formatDate } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const alertText = useAlertText();
  const params = useSearchParams();
  const vehicles = useApiData<VehicleDto[]>(`/orgs/${org.orgId}/vehicles`);
  const [vehicleId, setVehicleId] = useState<string | null>(params.get('vehicle'));
  const [period, setPeriod] = useState<Period>('today');
  const [custom, setCustom] = useState(() => ({ from: ymdTunis(new Date(Date.now() - 2 * DAY)), to: ymdTunis(new Date()) }));
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId && vehicles.data?.length) setVehicleId(vehicles.data[0]!.id);
  }, [vehicleId, vehicles.data]);

  const range = useMemo(() => {
    const today = startOfDayTunis(new Date());
    switch (period) {
      case 'today':
        return { from: today, to: new Date(today.getTime() + DAY) };
      case 'yesterday':
        return { from: new Date(today.getTime() - DAY), to: today };
      case 'last7':
        return { from: new Date(today.getTime() - 6 * DAY), to: new Date(today.getTime() + DAY) };
      case 'custom': {
        const from = fromYmdTunis(custom.from);
        const to = new Date(fromYmdTunis(custom.to).getTime() + DAY);
        return { from, to: to > from ? to : new Date(from.getTime() + DAY) };
      }
    }
  }, [period, custom]);

  const report = useApiData<TripsReportDto>(
    vehicleId ? `/orgs/${org.orgId}/vehicles/${vehicleId}/trips?from=${range.from.toISOString()}&to=${range.to.toISOString()}` : null,
  );
  useEffect(() => setSelectedTrip(null), [vehicleId, range.from.getTime(), range.to.getTime()]);
  const r = report.data;

  function exportCsv() {
    if (!r) return;
    const head = ['depart', 'arrivee', 'lieu_depart', 'lieu_arrivee', 'distance_km', 'duree_min', 'vitesse_max_kmh', 'vitesse_moy_kmh'];
    const rows = r.trips.map((x) => [x.startedAt, x.endedAt, x.start.place ?? '', x.end.place ?? '', (x.distanceM / 1000).toFixed(2), Math.round(x.durationS / 60), x.maxSpeedKmh, x.avgSpeedKmh]);
    const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajets-${r.vehicle.plate.replace(/\s+/g, '')}-${ymdTunis(range.from)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (vehicles.data && vehicles.data.length === 0) return <EmptyState>{t('trips.noVehicles')}</EmptyState>;

  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const lastDay = new Date(range.to.getTime() - 1);
  const rangeLabel = ymdTunis(range.from) === ymdTunis(lastDay) ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(lastDay)}`;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {vehicle ? (
              <>
                {vehicle.name} · <Plate plate={vehicle.plate} format={vehicle.plateFormat} />
              </>
            ) : (
              t('trips.title')
            )}
          </h1>
          <p className="mt-1 text-muted">{rangeLabel}</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={!r?.trips.length}>
          {t('trips.export')}
        </Button>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-72">
          <Field label={t('trips.vehicle')}>
            {(p) => (
              <Select {...p} value={vehicleId ?? ''} onChange={(e) => setVehicleId(e.target.value)}>
                {(vehicles.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('trips.period')}>
          {(['today', 'yesterday', 'last7', 'custom'] as const).map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {t(`trips.${p}`)}
            </Chip>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex gap-2">
            <Field label={t('trips.from')}>
              {(p) => <Input {...p} type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />}
            </Field>
            <Field label={t('trips.to')}>
              {(p) => <Input {...p} type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />}
            </Field>
          </div>
        )}
      </div>

      {report.error ? <Notice tone="error">{errorText(report.error).message}</Notice> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t('trips.distance')} value={r ? formatDistance(r.summary.distanceM, locale) : '—'} />
        <Tile label={t('trips.drivingTime')} value={r ? formatDuration(r.summary.drivingS) : '—'} />
        <Tile label={t('trips.maxSpeed')} value={r ? `${r.summary.maxSpeedKmh} km/h` : '—'} />
        <Tile label={t('trips.events')} value={r ? String(r.summary.events) : '—'} attention={!!r?.summary.events} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="h-[50dvh] overflow-hidden rounded-[var(--radius-card)] bg-white xl:h-[calc(100dvh-330px)] xl:min-h-[480px]">
          {r && <TripMap trips={r.trips} events={r.events} selectedId={selectedTrip} />}
        </div>
        <section aria-labelledby="timeline" className="rounded-[var(--radius-card)] bg-white p-5 xl:max-h-[calc(100dvh-330px)] xl:min-h-[480px] xl:overflow-y-auto">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
            <h2 id="timeline" className="text-xl font-bold">
              {t('trips.timeline')}
            </h2>
            {selectedTrip && (
              <button type="button" className="text-sm font-semibold text-teal-dark hover:underline" onClick={() => setSelectedTrip(null)}>
                {t('trips.allTrips')}
              </button>
            )}
          </div>
          {report.loading && !r && <p role="status" className="text-muted">{t('common.loading')}</p>}
          {r && r.trips.length === 0 && r.events.length === 0 && <p className="text-muted">{t('trips.noTrips')}</p>}
          {r && <Timeline report={r} selectedTrip={selectedTrip} onSelect={setSelectedTrip} formatTime={formatTime} alertText={alertText} />}
          {r && r.trips.length > 0 && <p className="mt-4 text-xs text-muted">{t('trips.placeHelp')}</p>}
        </section>
      </div>
    </>
  );
}

function Tile({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className={cx('rounded-[var(--radius-card)] px-5 py-4', attention ? 'bg-attention-bg text-attention' : 'bg-white')}>
      <p className={cx('text-sm', !attention && 'text-muted')}>{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
    </div>
  );
}

type Item =
  | { kind: 'departure' | 'arrival' | 'current'; at: string; place: string | null; tripId: string; n: number; line?: string }
  | { kind: 'stop'; at: string; place: string | null; durationS: number }
  | { kind: 'event'; at: string; alert: AlertDto };

function Timeline({
  report,
  selectedTrip,
  onSelect,
  formatTime,
  alertText,
}: {
  report: TripsReportDto;
  selectedTrip: string | null;
  onSelect: (id: string) => void;
  formatTime: (d: string) => string;
  alertText: ReturnType<typeof useAlertText>;
}) {
  const { t, locale } = useI18n();
  const items: Item[] = [];
  report.trips.forEach((tr, i) => {
    const line = t('trips.tripLine', { distance: formatDistance(tr.distanceM, locale), duration: formatDuration(tr.durationS), speed: `${tr.maxSpeedKmh} km/h` });
    items.push({ kind: 'departure', at: tr.startedAt, place: tr.start.place, tripId: tr.id, n: i + 1, line });
    items.push({ kind: tr.ongoing ? 'current' : 'arrival', at: tr.endedAt, place: tr.end.place, tripId: tr.id, n: i + 1 });
  });
  report.stops.forEach((s) => items.push({ kind: 'stop', at: s.startedAt, place: s.place, durationS: s.durationS }));
  report.events.forEach((e) => items.push({ kind: 'event', at: e.occurredAt, alert: e }));
  const order: Record<Item['kind'], number> = { arrival: 0, stop: 1, departure: 2, event: 3, current: 4 };
  items.sort((a, b) => a.at.localeCompare(b.at) || order[a.kind] - order[b.kind]);

  return (
    <ol className="flex flex-col">
      {items.map((it, idx) => {
        const time = formatTime(it.at);
        let title: React.ReactNode;
        let sub: React.ReactNode = null;
        let warn = false;
        let action: (() => void) | undefined;
        let active = false;
        if (it.kind === 'event') {
          const txt = alertText(it.alert);
          title = txt.type;
          sub = txt.desc;
          warn = true;
        } else if (it.kind === 'stop') {
          title = t('trips.stop', { duration: formatDuration(it.durationS) });
          sub = it.place ?? t('trips.placeUnknown');
        } else {
          title = it.kind === 'departure' ? `${t('trips.departure')} · ${t('trips.trip', { n: it.n })}` : it.kind === 'arrival' ? t('trips.arrival') : t('trips.currentPosition');
          sub = (
            <>
              {it.place ?? t('trips.placeUnknown')}
              {it.kind === 'departure' && it.line && <span className="block">{it.line}</span>}
            </>
          );
          if (it.kind === 'departure') {
            action = () => onSelect(it.tripId);
            active = selectedTrip === it.tripId;
          }
        }
        const body = (
          <>
            <time dateTime={it.at} className="pt-0.5 text-sm font-semibold tabular-nums text-muted">
              {time}
            </time>
            <span>
              <span className={cx('block font-bold', warn && 'text-attention')}>{title}</span>
              {sub && <span className="block text-sm text-muted">{sub}</span>}
            </span>
          </>
        );
        return (
          <li key={idx} className="border-b border-line last:border-0">
            {action ? (
              <button
                type="button"
                onClick={action}
                aria-pressed={active}
                className={cx('grid w-full grid-cols-[56px_1fr] gap-3 rounded-lg py-3 text-start hover:bg-canvas', active && 'bg-canvas')}
              >
                {body}
              </button>
            ) : (
              <div className="grid grid-cols-[56px_1fr] gap-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
