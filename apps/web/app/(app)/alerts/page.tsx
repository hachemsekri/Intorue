'use client';

import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  type AlertDto,
  type AlertRuleDto,
  type AlertSeverity,
  type AlertType,
  type GeofenceDto,
  type ScheduleWindow,
  type VehicleDto,
} from '@winou/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAlertText } from '@/components/alert-text';
import { LoadError } from '@/components/load-error';
import { Badge, Button, Card, Chip, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, cx, useErrorText } from '@/components/ui';
import type { Draft } from '@/components/zone-editor';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

const ZoneEditor = dynamic(() => import('@/components/zone-editor').then((m) => m.ZoneEditor), { ssr: false });

export default function AlertsPage() {
  return (
    <Suspense>
      <AlertsView />
    </Suspense>
  );
}

/** Tell the menu's alert count to refresh. */
const alertsChanged = () => window.dispatchEvent(new Event('intorue:alerts-changed'));

function AlertsView() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const managing = params.get('tab') === 'settings';

  if (managing)
    return (
      <div className="fade-in">
        <PageHeader
          title={t('alerts.settings')}
          actions={
            <Button variant="secondary" onClick={() => router.push('/alerts')}>
              {t('alerts.backToInbox')}
            </Button>
          }
        />
        <Settings />
      </div>
    );

  return (
    <div className="fade-in">
      <PageHeader title={t('alerts.title')} />
      <div className="flex flex-wrap items-start gap-3.5">
        <Inbox />
        <RulesAside />
      </div>
    </div>
  );
}

// ---------------- Inbox: to handle, then recently handled ----------------

function Inbox() {
  const { t, formatRelative, formatDateTime } = useI18n();
  const { org, can } = useSession();
  const errorText = useErrorText();
  const alertText = useAlertText();
  const open = useApiData<AlertDto[]>(`/orgs/${org.orgId}/alerts?status=open&limit=100`);
  const handled = useApiData<AlertDto[]>(`/orgs/${org.orgId}/alerts?status=handled&limit=20`);
  // The list shows the latest 100; the headline gives the true total.
  const count = useApiData<{ open: number }>(`/orgs/${org.orgId}/alerts/count`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reloadAll = useCallback(async () => {
    await Promise.all([open.reload(), handled.reload(), count.reload()]);
  }, [open.reload, handled.reload, count.reload]);

  // New alerts every 20 s while the page is visible.
  useEffect(() => {
    const tick = () => document.visibilityState === 'visible' && void Promise.all([open.reload(), count.reload()]);
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [open.reload, count.reload]);

  async function act(a: AlertDto, action: 'handle' | 'reopen') {
    setBusy(a.id);
    setError(null);
    try {
      await api(`/orgs/${org.orgId}/alerts/${a.id}/${action}`, { method: 'POST', body: action === 'handle' ? {} : undefined });
      await reloadAll();
      alertsChanged();
    } catch (e) {
      setError(errorText(e).message);
    } finally {
      setBusy(null);
    }
  }

  if (open.error && !open.data) return <div className="min-w-0 flex-[999_1_500px]"><LoadError onRetry={() => void reloadAll()} /></div>;

  const n = count.data?.open ?? open.data?.length ?? 0;
  const mayHandle = can('alerts.handle');

  return (
    <section aria-labelledby="inbox-head" className="flex min-w-0 flex-[999_1_500px] flex-col gap-2.5">
      <p id="inbox-head" className="h-display mt-1 mb-2 text-[clamp(34px,4.2vw,60px)]" aria-live="polite">
        {!open.data ? t('common.loading') : n === 1 ? t('alerts.toHandleOne') : n ? t('alerts.toHandleMany', { count: n }) : t('alerts.allHandled')}
      </p>
      {error && <Notice tone="error">{error}</Notice>}

      <ul className="flex flex-col gap-2.5" aria-label={t('alerts.toHandle')}>
        {(open.data ?? []).map((a) => {
          const txt = alertText(a);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-[20px] bg-ink px-5 py-[18px] text-canvas">
              <div className="min-w-0 flex-[1_1_280px]">
                <strong className="h-display mb-0.5 block text-2xl">{txt.title}</strong>
                <span className="text-[15px]">
                  {a.severity === 'urgent' && <span className="me-2 rounded-full bg-acc px-2 py-0.5 text-[13px] font-extrabold text-on-acc">{t('alerts.severities.urgent')}</span>}
                  {txt.desc}
                </span>
              </div>
              <time dateTime={a.occurredAt} title={formatDateTime(a.occurredAt)} className="text-sm font-semibold">
                {formatRelative(a.occurredAt)}
              </time>
              <div className="flex flex-wrap gap-2">
                <Link href={`/map?vehicle=${a.vehicle.id}`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold underline underline-offset-4">
                  {t('alerts.viewOnMap')}
                </Link>
                {mayHandle && (
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => void act(a, 'handle')}
                    aria-label={`${t('alerts.markHandled')} : ${txt.title}`}
                    className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-bold text-ink transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    {t('alerts.markHandled')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!!handled.data?.length && (
        <>
          <h2 className="mt-4 text-sm font-bold text-muted">{t('alerts.recentlyHandled')}</h2>
          <ul className="flex flex-col gap-2.5" aria-label={t('alerts.handled')}>
            {handled.data.map((a) => {
              const txt = alertText(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 rounded-[20px] bg-surface px-5 py-[18px]">
                  <div className="min-w-0 flex-[1_1_280px]">
                    <strong className="h-display mb-0.5 block text-2xl">{txt.title}</strong>
                    <span className="text-[15px] text-muted">{txt.desc}</span>
                    {a.handledAt && (
                      <span className="mt-1 block text-[13px] text-muted">
                        {t('alerts.handledBy', { name: a.handledBy?.name ?? '—', time: formatDateTime(a.handledAt) })}
                        {a.note ? ` · ${a.note}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span aria-hidden className="grid size-5 place-items-center rounded-full bg-ok-bg text-moving">
                      ✓
                    </span>
                    {t('alerts.handledShort')}
                  </span>
                  {mayHandle && (
                    <Button variant="secondary" disabled={busy === a.id} onClick={() => void act(a, 'reopen')} aria-label={`${t('alerts.reopen')} : ${txt.title}`}>
                      {t('alerts.reopen')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {open.data && n === 0 && !handled.data?.length && <EmptyState>{t('alerts.none')}</EmptyState>}
    </section>
  );
}

// ---------------- Rules: switch each one on or off ----------------

function useRuleSummary(zones: GeofenceDto[] | undefined) {
  const { t } = useI18n();
  const zoneName = (id: unknown) => zones?.find((z) => z.id === id)?.name ?? '—';
  return (r: AlertRuleDto) => {
    const p = r.params as Record<string, unknown>;
    switch (r.type) {
      case 'speeding':
        return t('rules.summary.speeding', { limit: p.limitKmh ? `${p.limitKmh} km/h` : t('rules.vehicleLimit'), seconds: Number(p.minDurationS ?? 0) });
      case 'geofence_exit':
      case 'geofence_enter':
        return t(`rules.summary.${r.type}`, { zone: zoneName(p.geofenceId) });
      case 'movement_schedule':
        return t('rules.summary.movement_schedule', { count: (p.windows as unknown[] | undefined)?.length ?? 0 });
      case 'device_offline':
        return t('rules.summary.device_offline', { minutes: Number(p.afterMinutes) });
      case 'low_battery':
        return t('rules.summary.low_battery', { pct: Number(p.thresholdPct) });
    }
  };
}

function RulesAside() {
  const { t } = useI18n();
  const { org, can } = useSession();
  const errorText = useErrorText();
  const rules = useApiData<AlertRuleDto[]>(`/orgs/${org.orgId}/alert-rules`);
  const zones = useApiData<GeofenceDto[]>(`/orgs/${org.orgId}/zones`);
  const summary = useRuleSummary(zones.data);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const writable = can('alerts.configure');

  async function toggle(r: AlertRuleDto) {
    setBusy(r.id);
    setError(null);
    try {
      await api(`/orgs/${org.orgId}/alert-rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } });
      await rules.reload();
    } catch (e) {
      setError(errorText(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside aria-labelledby="rules-head" className="flex min-w-0 flex-[1_1_310px] flex-col gap-1.5 rounded-[20px] bg-surface p-5">
      <h2 id="rules-head" className="h-display mb-2 text-2xl">
        {t('alerts.settingsShort')}
      </h2>
      {error && <Notice tone="error">{error}</Notice>}
      {!!rules.error && !rules.data && (
        <p className="text-muted">
          {t('common.loadFailed')}{' '}
          <button type="button" className="min-h-11 font-bold text-ink underline underline-offset-4" onClick={() => void rules.reload()}>
            {t('common.retry')}
          </button>
        </p>
      )}
      {!rules.data && !rules.error && <p role="status" className="text-muted">{t('common.loading')}</p>}
      {rules.data?.length === 0 && <p className="text-muted">{t('rules.empty')}</p>}
      {[...(rules.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => (
        <label key={r.id} className={cx('flex min-h-[50px] items-center justify-between gap-3 font-semibold', writable ? 'cursor-pointer' : 'cursor-default')}>
          <span className="min-w-0">
            {r.name}
            <small className="block text-sm font-normal text-muted">
              {summary(r)} · {r.enabled ? t('rules.enabled') : t('rules.disabled')}
            </small>
          </span>
          <input
            type="checkbox"
            checked={r.enabled}
            disabled={!writable || busy === r.id}
            onChange={() => void toggle(r)}
            className="size-[22px] shrink-0 accent-[var(--acc)]"
            title={writable ? undefined : t('rules.noPermission')}
          />
        </label>
      ))}
      <Link
        href="/alerts?tab=settings"
        className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-surface-2 px-4 text-sm font-bold text-ink transition-transform hover:-translate-y-px"
      >
        {writable ? t('alerts.manageRules') : t('alerts.viewRules')}
      </Link>
    </aside>
  );
}

// ---------------- Settings: rules and zones ----------------

function Settings() {
  const { t } = useI18n();
  const { org, can } = useSession();
  const errorText = useErrorText();
  const rules = useApiData<AlertRuleDto[]>(`/orgs/${org.orgId}/alert-rules`);
  const zones = useApiData<GeofenceDto[]>(`/orgs/${org.orgId}/zones`);
  const vehicles = useApiData<VehicleDto[]>(`/orgs/${org.orgId}/vehicles`);
  const [editing, setEditing] = useState<AlertRuleDto | 'new' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const writable = can('alerts.configure');

  async function toggle(r: AlertRuleDto) {
    try {
      await api(`/orgs/${org.orgId}/alert-rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } });
      await rules.reload();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e).message });
    }
  }
  async function remove(r: AlertRuleDto) {
    if (!window.confirm(t('rules.confirmDelete'))) return;
    try {
      await api(`/orgs/${org.orgId}/alert-rules/${r.id}`, { method: 'DELETE' });
      await rules.reload();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e).message });
    }
  }

  const summary = useRuleSummary(zones.data);

  return (
    <div className="flex flex-col gap-6">
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="h-display text-2xl">{t('rules.title')}</h2>
          {writable && <Button onClick={() => setEditing('new')}>{t('rules.add')}</Button>}
        </div>
        {rules.data && rules.data.length === 0 && <p className="text-muted">{t('rules.empty')}</p>}
        <ul className="flex flex-col">
          {[...(rules.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => (
            <li key={r.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {r.name} {!r.enabled && <Badge tone="neutral">{t('rules.disabled')}</Badge>}
                </p>
                <p className="text-sm text-muted">
                  {t(`alerts.types.${r.type}`)} · {summary(r)} · {r.vehicleIds ? t('rules.someVehicles', { count: r.vehicleIds.length }) : t('rules.allVehicles')} ·{' '}
                  {t(`alerts.severities.${r.severity}`)}
                </p>
              </div>
              {writable && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={r.enabled} onChange={() => void toggle(r)} className="size-5 accent-[var(--acc)]" />
                    {t('rules.enabled')}
                  </label>
                  <Button variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setEditing(r)} aria-label={`${t('common.edit')} ${r.name}`}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" className="min-h-11 px-3 text-sm" onClick={() => void remove(r)} aria-label={`${t('rules.remove')} ${r.name}`}>
                    {t('rules.remove')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ZonesCard zones={zones.data ?? []} reload={zones.reload} writable={writable} />

      <RuleDialog
        rule={editing}
        zones={zones.data ?? []}
        vehicles={vehicles.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          setNotice({ tone: 'success', text: t('common.saved') });
          await rules.reload();
        }}
      />
    </div>
  );
}

const DEFAULT_PARAMS: Record<AlertType, Record<string, unknown>> = {
  speeding: { limitKmh: null, minDurationS: 15 },
  geofence_exit: { geofenceId: '' },
  geofence_enter: { geofenceId: '' },
  movement_schedule: { windows: [{ days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' }], minSpeedKmh: 5 },
  device_offline: { afterMinutes: 15 },
  low_battery: { thresholdPct: 20 },
};

function RuleDialog({
  rule,
  zones,
  vehicles,
  onClose,
  onSaved,
}: {
  rule: AlertRuleDto | 'new' | null;
  zones: GeofenceDto[];
  vehicles: VehicleDto[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const existing = rule && rule !== 'new' ? rule : null;
  const [type, setType] = useState<AlertType>('speeding');
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<AlertSeverity>('warning');
  const [params, setParams] = useState<Record<string, unknown>>(DEFAULT_PARAMS.speeding);
  const [scope, setScope] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rule) return;
    setError(null);
    if (existing) {
      setType(existing.type);
      setName(existing.name);
      setSeverity(existing.severity);
      setParams(existing.params);
      setScope(existing.vehicleIds);
    } else {
      setType('speeding');
      setName('');
      setSeverity('warning');
      setParams(DEFAULT_PARAMS.speeding);
      setScope(null);
    }
  }, [rule]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeType = (next: AlertType) => {
    setType(next);
    setParams({ ...DEFAULT_PARAMS[next], ...(next.startsWith('geofence') && zones[0] ? { geofenceId: zones[0].id } : {}) });
    if (next === 'device_offline') setSeverity('urgent');
  };
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim() || t(`alerts.types.${type}`), severity, vehicleIds: scope, params };
      if (existing) await api(`/orgs/${org.orgId}/alert-rules/${existing.id}`, { method: 'PATCH', body });
      else await api(`/orgs/${org.orgId}/alert-rules`, { method: 'POST', body: { ...body, type, enabled: true } });
      await onSaved();
    } catch (err) {
      setError(errorText(err).message);
    } finally {
      setBusy(false);
    }
  }

  const num = (k: string, opts: { min: number; max: number; optional?: boolean }, fieldProps: object) => (
    <Input
      {...fieldProps}
      type="number"
      inputMode="numeric"
      min={opts.min}
      max={opts.max}
      value={params[k] === null || params[k] === undefined ? '' : String(params[k])}
      onChange={(e) => set(k, e.target.value === '' ? (opts.optional ? null : '') : Number(e.target.value))}
      required={!opts.optional}
    />
  );

  return (
    <Dialog open={rule !== null} onClose={onClose} title={t(existing ? 'rules.editTitle' : 'rules.add')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Field label={t('rules.type')}>
          {(p) => (
            <Select {...p} value={type} onChange={(e) => changeType(e.target.value as AlertType)} disabled={!!existing}>
              {ALERT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`alerts.types.${x}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('rules.name')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder={t(`alerts.types.${type}`)} maxLength={80} />}</Field>

        {type === 'speeding' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('rules.limit')} hint={t('rules.limitHelp')} optional>
              {(p) => num('limitKmh', { min: 20, max: 250, optional: true }, p)}
            </Field>
            <Field label={t('rules.minDuration')}>{(p) => num('minDurationS', { min: 0, max: 600 }, p)}</Field>
          </div>
        )}
        {(type === 'geofence_exit' || type === 'geofence_enter') &&
          (zones.length === 0 ? (
            <Notice>{t('rules.noZone')}</Notice>
          ) : (
            <Field label={t('rules.zone')}>
              {(p) => (
                <Select {...p} value={String(params.geofenceId ?? '')} onChange={(e) => set('geofenceId', e.target.value)} required>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        {type === 'device_offline' && <Field label={t('rules.afterMinutes')}>{(p) => num('afterMinutes', { min: 5, max: 1440 }, p)}</Field>}
        {type === 'low_battery' && <Field label={t('rules.threshold')}>{(p) => num('thresholdPct', { min: 5, max: 50 }, p)}</Field>}
        {type === 'movement_schedule' && (
          <Windows windows={(params.windows as ScheduleWindow[]) ?? []} onChange={(w) => set('windows', w)} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('rules.severity')}>
            {(p) => (
              <Select {...p} value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity)}>
                {ALERT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`alerts.severities.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">{t('rules.vehicles')}</legend>
          <label className="mb-2 flex items-center gap-2">
            <input type="checkbox" className="size-5 accent-[var(--acc)]" checked={scope === null} onChange={(e) => setScope(e.target.checked ? null : [])} />
            {t('rules.allVehicles')}
          </label>
          {scope !== null && (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border-2 border-line p-3 sm:grid-cols-2">
              {vehicles.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--acc)]"
                    checked={scope.includes(v.id)}
                    onChange={(e) => setScope((s) => (e.target.checked ? [...(s ?? []), v.id] : (s ?? []).filter((x) => x !== v.id)))}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" busy={busy} disabled={(type.startsWith('geofence') && zones.length === 0) || (scope !== null && scope.length === 0)}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Windows({ windows, onChange }: { windows: ScheduleWindow[]; onChange: (w: ScheduleWindow[]) => void }) {
  const { t } = useI18n();
  const update = (i: number, patch: Partial<ScheduleWindow>) => onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium text-muted">{t('rules.allowedHours')}</legend>
      <p className="text-xs text-muted">{t('rules.allowedHelp')}</p>
      {windows.length === 0 && <Notice>{t('rules.noWindow')}</Notice>}
      {windows.map((w, i) => (
        <div key={i} className="rounded-xl border-2 border-line p-3">
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t('rules.allowedHours')}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Chip
                key={d}
                active={w.days.includes(d)}
                onClick={() => update(i, { days: w.days.includes(d) ? w.days.filter((x) => x !== d) : [...w.days, d].sort() })}
              >
                {t(`rules.days.${d}` as never)}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('rules.from')}>{(p) => <Input {...p} type="time" value={w.start} onChange={(e) => update(i, { start: e.target.value })} className="w-32" />}</Field>
            <Field label={t('rules.to')}>{(p) => <Input {...p} type="time" value={w.end} onChange={(e) => update(i, { end: e.target.value })} className="w-32" />}</Field>
            <Button type="button" variant="ghost" onClick={() => onChange(windows.filter((_, j) => j !== i))}>
              {t('rules.remove')}
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" className="self-start" onClick={() => onChange([...windows, { days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' }])}>
        {t('rules.addWindow')}
      </Button>
    </fieldset>
  );
}

function ZonesCard({ zones, reload, writable }: { zones: GeofenceDto[]; reload: () => Promise<void>; writable: boolean }) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startNew = () => {
    setEditingId(null);
    setSelectedId(null);
    setName('');
    setDraft({ kind: 'circle', center: null, radiusM: 500 });
    setError(null);
  };
  const startEdit = (z: GeofenceDto) => {
    setEditingId(z.id);
    setSelectedId(z.id);
    setName(z.name);
    setDraft(z.shape.kind === 'circle' ? { kind: 'circle', center: z.shape.center, radiusM: z.shape.radiusM } : { kind: 'polygon', points: z.shape.points });
    setError(null);
  };
  const cancel = () => {
    setDraft(null);
    setEditingId(null);
  };

  async function save() {
    const { draftToShape } = await import('@/components/zone-editor');
    const shape = draft && draftToShape(draft);
    if (!shape) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim() || t('zones.title'), shape };
      if (editingId) await api(`/orgs/${org.orgId}/zones/${editingId}`, { method: 'PATCH', body });
      else await api(`/orgs/${org.orgId}/zones`, { method: 'POST', body });
      cancel();
      await reload();
    } catch (e) {
      setError(errorText(e).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(z: GeofenceDto) {
    if (!window.confirm(t('zones.confirmDelete'))) return;
    try {
      await api(`/orgs/${org.orgId}/zones/${z.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      setError(errorText(e).message);
    }
  }

  const ready = draft && (draft.kind === 'circle' ? !!draft.center : draft.points.length >= 3);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t('zones.title')}</h2>
        {writable && !draft && <Button onClick={startNew}>{t('zones.add')}</Button>}
      </div>
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[420px] overflow-hidden rounded-xl border-2 border-line">
          <ZoneEditor zones={zones} draft={draft} onDraftChange={setDraft} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div>
          {draft ? (
            <div className="flex flex-col gap-4">
              <h3 className="font-bold">{t(editingId ? 'zones.editTitle' : 'zones.add')}</h3>
              <Field label={t('zones.name')}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />}</Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-muted">{t('zones.kind')}</legend>
                <div className="flex gap-2">
                  <Chip active={draft.kind === 'circle'} onClick={() => setDraft({ kind: 'circle', center: null, radiusM: 500 })}>
                    {t('zones.circle')}
                  </Chip>
                  <Chip active={draft.kind === 'polygon'} onClick={() => setDraft({ kind: 'polygon', points: [] })}>
                    {t('zones.polygon')}
                  </Chip>
                </div>
              </fieldset>
              <p className="text-sm text-muted" role="status">
                {t(draft.kind === 'circle' ? 'zones.drawCircle' : 'zones.drawPolygon')}
              </p>
              {draft.kind === 'circle' ? (
                <Field label={t('zones.radius')}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={50}
                      max={100000}
                      step={50}
                      value={draft.radiusM}
                      onChange={(e) => setDraft({ ...draft, radiusM: Number(e.target.value) || 50 })}
                    />
                  )}
                </Field>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>{t('zones.points', { count: draft.points.length })}</span>
                  <Button type="button" variant="ghost" className="min-h-11 px-3 text-sm" onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}>
                    {t('zones.undo')}
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-11 px-3 text-sm" onClick={() => setDraft({ ...draft, points: [] })}>
                    {t('zones.clear')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={cancel}>
                  {t('common.cancel')}
                </Button>
                <Button type="button" busy={busy} disabled={!ready} onClick={() => void save()}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col">
              {zones.length === 0 && <li className="text-muted">{t('zones.empty')}</li>}
              {zones.map((z) => (
                <li key={z.id} className={cx('flex items-center justify-between gap-2 border-b border-line py-2.5 last:border-0', selectedId === z.id && 'font-semibold')}>
                  <button type="button" className="min-h-11 min-w-0 truncate text-start hover:underline" onClick={() => setSelectedId(z.id)}>
                    {z.name}
                    <span className="block text-[13px] font-normal text-muted">
                      {z.shape.kind === 'circle' ? `${t('zones.circle')} · ${z.shape.radiusM} m` : `${t('zones.polygon')} · ${t('zones.points', { count: z.shape.points.length })}`}
                    </span>
                  </button>
                  {writable && (
                    <span className="flex shrink-0 gap-1">
                      <Button variant="ghost" className="min-h-11 px-3 text-sm" onClick={() => startEdit(z)} aria-label={`${t('common.edit')} ${z.name}`}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="ghost" className="min-h-11 px-3 text-sm text-danger" onClick={() => void remove(z)} aria-label={`${t('zones.remove')} ${z.name}`}>
                        {t('zones.remove')}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
