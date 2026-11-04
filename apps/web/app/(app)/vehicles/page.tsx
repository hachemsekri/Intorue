'use client';

import { PLATE_FORMATS, VEHICLE_TYPES, type VehicleDto, type VehicleType } from '@winou/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { DeviceStatusBadge, Kpi, LastSeen, Plate } from '@/components/fleet-bits';
import { Badge, Button, Chip, DemoBadge, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

export default function VehiclesPage() {
  const { t } = useI18n();
  const { org, can } = useSession();
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorText = useErrorText();

  const { data, loading, error, reload } = useApiData<VehicleDto[]>(
    `/orgs/${org.orgId}/vehicles${archived ? '?archived=true' : ''}`,
  );
  const all = data ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
    return all.filter(
      (v) =>
        (type === 'all' || v.type === type) &&
        (!needle || v.name.toLowerCase().includes(needle) || v.plate.toLowerCase().includes(needle)),
    );
  }, [all, q, type]);
  const writable = can('vehicles.write');
  const isDemo = org.orgName.startsWith('[DÉMO]');

  async function toggleArchive(v: VehicleDto) {
    if (!v.archivedAt && !window.confirm(t('common.confirmArchive'))) return;
    try {
      await api(`/orgs/${org.orgId}/vehicles/${v.id}/${v.archivedAt ? 'unarchive' : 'archive'}`, { method: 'POST' });
      setNotice(t('common.saved'));
      await reload();
    } catch (e) {
      setNotice(errorText(e).message);
    }
  }

  return (
    <>
      <PageHeader
        title={t('vehicles.title')}
        subtitle={
          <span className="inline-flex items-center gap-2">
            {org.orgName.replace('[DÉMO] ', '')}
            {isDemo && <DemoBadge />}
          </span>
        }
        actions={writable && <Button onClick={() => setEditing('new')}>{t('vehicles.add')}</Button>}
      />

      {!archived && data && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
          <Kpi value={all.length} label={t('vehicles.kpiTotal')} />
          <Kpi value={all.filter((v) => v.device?.status === 'online').length} label={t('vehicles.kpiOnline')} />
          <Kpi value={all.filter((v) => !v.device).length} label={t('vehicles.kpiNoDevice')} tone={all.some((v) => !v.device) ? 'attention' : 'default'} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-80">
          <Field label={t('common.search')}>
            {(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('vehicles.searchPlaceholder')} />}
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('vehicles.type')}>
          <Chip active={type === 'all'} onClick={() => setType('all')}>
            {t('common.all')}
          </Chip>
          {VEHICLE_TYPES.map((vt) => (
            <Chip key={vt} active={type === vt} onClick={() => setType(vt)}>
              {t(`vehicles.typesPlural.${vt}`)}
            </Chip>
          ))}
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm lg:ms-auto">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5 accent-navy" />
          {t('vehicles.showArchived')}
        </label>
      </div>

      {notice && (
        <div className="mb-4">
          <Notice>{notice}</Notice>
        </div>
      )}
      {error ? <Notice tone="error">{errorText(error).message}</Notice> : null}
      {loading && !data && <p role="status" className="text-muted">{t('common.loading')}</p>}
      {data && shown.length === 0 && <EmptyState>{t('vehicles.empty')}</EmptyState>}

      {shown.length > 0 && (
        <ul className="overflow-hidden rounded-[var(--radius-card)] bg-white" aria-label={t('vehicles.title')}>
          {shown.map((v) => (
            <li key={v.id} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <TypeIcon type={v.type} />
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-bold">{v.name}</p>
                  <p className="text-sm text-muted">
                    <Plate plate={v.plate} format={v.plateFormat} /> · {t(`vehicles.types.${v.type}`)}
                    {v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(' ')}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                {v.archivedAt ? (
                  <Badge tone="neutral">{t('vehicles.archived')}</Badge>
                ) : v.device ? (
                  <span className="flex items-center gap-2">
                    <DeviceStatusBadge status={v.device.status} />
                    <LastSeen at={v.device.lastSeenAt} />
                  </span>
                ) : (
                  <Badge tone="attention">{t('vehicles.noDevice')}</Badge>
                )}
                {writable && (
                  <span className="flex gap-2">
                    {!v.archivedAt && (
                      <Button variant="secondary" className="min-h-10 px-3 text-sm" onClick={() => setEditing(v)} aria-label={`${t('common.edit')} ${v.name}`}>
                        {t('common.edit')}
                      </Button>
                    )}
                    <Button variant="ghost" className="min-h-10 px-3 text-sm" onClick={() => void toggleArchive(v)} aria-label={`${t(v.archivedAt ? 'common.unarchive' : 'common.archive')} ${v.name}`}>
                      {t(v.archivedAt ? 'common.unarchive' : 'common.archive')}
                    </Button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <VehicleDialog
        vehicle={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          setNotice(t('common.saved'));
          await reload();
        }}
      />
    </>
  );
}

function TypeIcon({ type }: { type: VehicleType }) {
  const path =
    type === 'car'
      ? 'M5 16h14M6.5 16l1.4-5.2A2 2 0 0 1 9.8 9.3h4.4a2 2 0 0 1 1.9 1.5L17.5 16M5 16v2.5M19 16v2.5'
      : type === 'motorcycle'
        ? 'M6 17a2.5 2.5 0 1 0 0-.01M18 17a2.5 2.5 0 1 0 0-.01M8.5 17h5l3-6h-4l-2 3M14 8h2.5'
        : 'M6 18a2 2 0 1 0 0-.01M18 18a2 2 0 1 0 0-.01M8 18h8l-1-11h3';
  return (
    <span aria-hidden className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-teal-dark">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

function VehicleDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: VehicleDto | 'new' | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const v = vehicle && vehicle !== 'new' ? vehicle : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => {
      const s = String(f.get(k) ?? '').trim();
      return s === '' ? null : s;
    };
    const speed = str('speedLimitKmh');
    const plateFormat = str('plateFormat');
    const body = {
      type: f.get('type'),
      name: str('name') ?? '',
      make: str('make'),
      model: str('model'),
      color: str('color'),
      plate: str('plate') ?? '',
      ...(plateFormat ? { plateFormat } : {}),
      speedLimitKmh: speed ? Number(speed) : null,
    };
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (v) await api(`/orgs/${org.orgId}/vehicles/${v.id}`, { method: 'PATCH', body });
      else await api(`/orgs/${org.orgId}/vehicles`, { method: 'POST', body });
      await onSaved();
    } catch (err) {
      const r = errorText(err);
      setError(r.message);
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={vehicle !== null} onClose={onClose} title={t(v ? 'vehicles.editTitle' : 'vehicles.add')}>
      <form key={v?.id ?? 'new'} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">{t('vehicles.type')}</legend>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((vt) => (
              <label key={vt} className="cursor-pointer">
                <input type="radio" name="type" value={vt} defaultChecked={(v?.type ?? 'car') === vt} className="peer sr-only" />
                <span className="inline-flex min-h-10 items-center rounded-full border border-line bg-white px-4 peer-checked:border-navy peer-checked:bg-navy peer-checked:font-semibold peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-teal">
                  {t(`vehicles.types.${vt}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('vehicles.name')} error={fields.name}>
          {(p) => <Input {...p} name="name" defaultValue={v?.name} placeholder={t('vehicles.namePlaceholder')} required maxLength={80} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label={t('vehicles.plate')} error={fields.plate}>
            {(p) => <Input {...p} name="plate" defaultValue={v?.plate} placeholder={t('vehicles.platePlaceholder')} required dir="ltr" maxLength={30} />}
          </Field>
          <Field label={t('vehicles.plateFormat')}>
            {(p) => (
              <Select {...p} name="plateFormat" defaultValue={v?.plateFormat ?? ''}>
                <option value="">{t('vehicles.plateAuto')}</option>
                {PLATE_FORMATS.map((pf) => (
                  <option key={pf} value={pf}>
                    {t(`vehicles.plateFormats.${pf}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('vehicles.make')} optional>
            {(p) => <Input {...p} name="make" defaultValue={v?.make ?? ''} maxLength={60} />}
          </Field>
          <Field label={t('vehicles.model')} optional>
            {(p) => <Input {...p} name="model" defaultValue={v?.model ?? ''} maxLength={60} />}
          </Field>
          <Field label={t('vehicles.color')} optional>
            {(p) => <Input {...p} name="color" defaultValue={v?.color ?? ''} maxLength={40} />}
          </Field>
          <Field label={t('vehicles.speedLimit')} optional error={fields.speedLimitKmh}>
            {(p) => <Input {...p} name="speedLimitKmh" type="number" inputMode="numeric" min={10} max={250} defaultValue={v?.speedLimitKmh ?? ''} />}
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" busy={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
