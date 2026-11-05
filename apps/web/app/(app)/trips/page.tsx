'use client';

import type { AlertDto, AlertRuleDto, TripsReportDto, VehicleDto } from '@winou/shared';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useAlertText } from '@/components/alert-text';
import { Plate } from '@/components/fleet-bits';
import { Icon } from '@/components/icons';
import { LoadError } from '@/components/load-error';
import { SpeedChart } from '@/components/speed-chart';
import { Button, Chip, EmptyState, Field, Input, Notice, PageHeader, Select, cx, useErrorText } from '@/components/ui';
import { formatDistance, formatDuration, fromYmdTunis, intl, startOfDayTunis, ymdTunis } from '@/lib/format';
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
  const rules = useApiData<AlertRuleDto[]>(`/orgs/${org.orgId}/alert-rules`);
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

  if (vehicles.error) return <LoadError onRetry={() => void vehicles.reload()} />;
  if (vehicles.data && vehicles.data.length === 0)
    return (
      <>
        <PageHeader title={t('trips.title')} />
        <EmptyState>{t('trips.noVehicles')}</EmptyState>
      </>
    );

  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const lastDay = new Date(range.to.getTime() - 1);
  const rangeLabel = ymdTunis(range.from) === ymdTunis(lastDay) ? formatDate(range.from) : `${formatDate(range.from)} – ${formatDate(lastDay)}`;
  const chartTrips = r ? (selectedTrip ? r.trips.filter((x) => x.id === selectedTrip) : r.trips) : [];
  const limit = speedLimitFor(vehicle, rules.data);
  const periodLabel = (p: Period) =>
    p === 'today' ? new Intl.DateTimeFormat(intl(locale), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Africa/Tunis' }).format(new Date()) : t(`trips.${p}`);

  return (
    <div className="fade-in flex flex-col gap-3.5">
      <PageHeader title={t('trips.title')} />

      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor="trip-vehicle" className="sr-only">
          {t('trips.vehicle')}
        </label>
        <Select id="trip-vehicle" className="!min-h-11 !w-auto max-w-full !rounded-full !bg-surface font-bold sm:me-2" value={vehicleId ?? ''} onChange={(e) => setVehicleId(e.target.value)}>
          {(vehicles.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.plate}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('trips.period')}>
          {(['today', 'yesterday', 'last7', 'custom'] as const).map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              <span className="inline-block first-letter:uppercase">{periodLabel(p)}</span>
            </Chip>
          ))}
        </div>
        <Button variant="secondary" className="ms-auto" onClick={exportCsv} disabled={!r?.trips.length}>
          <Icon name="download" size={18} />
          {t('trips.export')}
        </Button>
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap gap-2">
          <Field label={t('trips.from')}>
            {(p) => <Input {...p} type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />}
          </Field>
          <Field label={t('trips.to')}>
            {(p) => <Input {...p} type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />}
          </Field>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {vehicle ? `${vehicle.name}, ${rangeLabel}` : rangeLabel}
      </p>

      {report.error ? (
        <Notice tone="error">
          {errorText(report.error).message}{' '}
          <button type="button" className="min-h-11 font-bold underline underline-offset-4" onClick={() => void report.reload()}>
            {t('common.retry')}
          </button>
        </Notice>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
        <Tile label={t('trips.distance')} value={r ? formatDistance(r.summary.distanceM, locale) : '—'} />
        <Tile label={t('trips.drivingTime')} value={r ? formatDuration(r.summary.drivingS) : '—'} />
        <Tile label={t('trips.maxSpeed')} value={r ? `${r.summary.maxSpeedKmh} km/h` : '—'} />
        <Tile label={t('trips.eventsDuring')} value={r ? String(r.summary.events) : '—'} accent />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <section aria-label={t('trips.routeAndSpeed')} className="flex min-w-0 flex-[999_1_460px] flex-col gap-3.5">
          <div className="relative h-[46dvh] min-h-[320px] overflow-hidden rounded-[20px] bg-surface-2 lg:h-[400px]">
            {r && <TripMap trips={r.trips} events={r.events} selectedId={selectedTrip} />}
            {report.loading && !r && (
              <p role="status" className="absolute inset-0 grid place-items-center text-muted">
                {t('common.loading')}
              </p>
            )}
          </div>
          <div className="rounded-[20px] bg-surface p-[18px]">
            <div className="flex flex-wrap justify-between gap-2.5">
              <h2 className="h-display text-xl">{t('trips.speed')}</h2>
              <span className="text-muted">{t('trips.limitNote', { limit })}</span>
            </div>
            {r && <SpeedChart trips={chartTrips} limitKmh={limit} />}
          </div>
        </section>
        <aside aria-labelledby="timeline" className="min-w-0 flex-[1_1_310px] rounded-[20px] bg-surface p-5 lg:max-h-[640px] lg:overflow-y-auto">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="timeline" className="h-display text-[22px]">
              {t('trips.timeline')}
            </h2>
            {selectedTrip && (
              <button type="button" className="min-h-11 text-sm font-bold text-acc-text underline-offset-4 hover:underline" onClick={() => setSelectedTrip(null)}>
                {t('trips.allTrips')}
              </button>
            )}
          </div>
          {report.loading && !r && (
            <p role="status" className="text-muted">
              {t('common.loading')}
            </p>
          )}
          {r && r.trips.length === 0 && r.events.length === 0 && <p className="text-muted">{t('trips.noTrips')}</p>}
          {r && <Timeline report={r} selectedTrip={selectedTrip} onSelect={setSelectedTrip} formatTime={formatTime} alertText={alertText} />}
          {r && r.trips.length > 0 && <p className="mt-4 text-[13px] text-muted">{t('trips.placeHelp')}</p>}
        </aside>
      </div>
    </div>
  );
}

/** Limit for the chart: the vehicle's own, else the lowest enabled speeding rule covering it, else 110 km/h (as the alert engine does). */
function speedLimitFor(v: VehicleDto | undefined, rules: AlertRuleDto[] | undefined): number {
  if (v?.speedLimitKmh) return v.speedLimitKmh;
  const limits = (rules ?? [])
    .filter((r) => r.type === 'speeding' && r.enabled && (!r.vehicleIds || (v && r.vehicleIds.includes(v.id))))
    .map((r) => (r.params as { limitKmh?: number | null }).limitKmh)
    .filter((x): x is number => typeof x === 'number');
  return limits.length ? Math.min(...limits) : 110;
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cx('rounded-[20px] p-[17px]', accent ? 'bg-acc text-on-acc' : 'bg-surface')}>
      <strong className="h-display block text-[clamp(28px,3vw,38px)] tabular-nums">{value}</strong>
      <span className={cx('block', !accent && 'text-muted')}>{label}</span>
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
    <ol className="flex flex-col gap-1.5">
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
            <time dateTime={it.at} className="pt-0.5 tabular-nums text-muted">
              {time}
            </time>
            <span>
              <span className={cx('block font-bold', warn && 'text-acc-text')}>
                {warn && <span className="sr-only">{t('alerts.title')}: </span>}
                {title}
              </span>
              {sub && <span className="block text-sm text-muted">{sub}</span>}
            </span>
          </>
        );
        return (
          <li key={idx}>
            {action ? (
              <button
                type="button"
                onClick={action}
                aria-pressed={active}
                className={cx('grid min-h-11 w-full grid-cols-[52px_1fr] gap-2.5 rounded-[14px] px-1.5 py-2 text-start hover:bg-surface-2', active && 'bg-surface-2')}
              >
                {body}
              </button>
            ) : (
              <div className="grid grid-cols-[52px_1fr] gap-2.5 px-1.5 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
