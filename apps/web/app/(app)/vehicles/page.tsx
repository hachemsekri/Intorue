'use client';

import { PLATE_FORMATS, VEHICLE_TYPES, type DeviceDto, type VehicleDto, type VehicleType } from '@winou/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { DeviceStatusBadge, LastSeen, Plate } from '@/components/fleet-bits';
import { FleetTabs } from '@/components/fleet-tabs';
import { Icon } from '@/components/icons';
import { LoadError } from '@/components/load-error';
import { Badge, Button, Chip, DemoBadge, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, useErrorText } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

export default function VehiclesPage() {
  const { t } = useI18n();
  const { org, can } = useSession();
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | 'new' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const errorText = useErrorText();

  const { data, loading, error, reload } = useApiData<VehicleDto[]>(`/orgs/${org.orgId}/vehicles${archived ? '?archived=true' : ''}`);
  const all = data ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/\s+/g, '');
    return all.filter(
      (v) =>
        (type === 'all' || v.type === type) &&
        (!needle || v.name.toLowerCase().replace(/\s+/g, '').includes(needle) || v.plate.toLowerCase().replace(/\s+/g, '').includes(needle) || v.device?.imei.includes(needle)),
    );
  }, [all, q, type]);
  const writable = can('vehicles.write');
  const isDemo = org.orgName.startsWith('[DÉMO]');

  async function toggleArchive(v: VehicleDto) {
    if (!v.archivedAt && !window.confirm(t('common.confirmArchive'))) return;
    try {
      await api(`/orgs/${org.orgId}/vehicles/${v.id}/${v.archivedAt ? 'unarchive' : 'archive'}`, { method: 'POST' });
      setNotice({ tone: 'success', text: t('common.saved') });
      await reload();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e).message });
    }
  }

  const online = all.filter((v) => v.device?.status === 'online').length;
  const noDevice = all.filter((v) => !v.device).length;

  return (
    <div className="fade-in">
      <PageHeader
        title={t('vehicles.pageTitle')}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {org.orgName.replace('[DÉMO] ', '')}
            {isDemo && <DemoBadge />}
            {data && !archived && <span>· {t('vehicles.counts', { total: all.length, online, noDevice })}</span>}
          </span>
        }
      />
      <FleetTabs />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <label htmlFor="veh-search" className="sr-only">
          {t('common.search')}
        </label>
        <div className="relative w-full sm:w-72">
          <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-muted">
            <Icon name="search" size={18} />
          </span>
          <input
            id="veh-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('vehicles.searchPlaceholder')}
            className="h-11 w-full rounded-[14px] border-2 border-transparent bg-surface ps-10 pe-3.5 text-[15px] font-medium text-ink focus:border-acc focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('vehicles.type')}>
          <Chip active={type === 'all'} onClick={() => setType('all')}>
            {t('common.all')}
          </Chip>
          {VEHICLE_TYPES.map((vt) => (
            <Chip key={vt} active={type === vt} onClick={() => setType(vt)}>
              {t(`vehicles.typesPlural.${vt}`)}
            </Chip>
          ))}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:ms-auto">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5 accent-[var(--acc)]" />
          {t('vehicles.showArchived')}
        </label>
      </div>

      {notice && (
        <div className="mb-3.5">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3.5">
        <section aria-label={t('vehicles.title')} className="min-w-0 flex-[999_1_560px]">
          {error && !data ? <LoadError onRetry={() => void reload()} /> : null}
          {loading && !data && (
            <p role="status" className="rounded-[20px] bg-surface px-6 py-10 text-center text-muted">
              {t('common.loading')}
            </p>
          )}
          {data && shown.length === 0 && <EmptyState>{all.length ? t('vehicles.noMatch') : t('vehicles.empty')}</EmptyState>}
          {shown.length > 0 && (
            <ul className="flex flex-col gap-2 sm:hidden" aria-label={t('vehicles.title')}>
              {shown.map((v) => (
                <li key={v.id} className="flex flex-col gap-2 rounded-[20px] bg-surface p-4">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
                      <Icon name={v.type} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate">{v.name}</strong>
                      <span className="block text-[13px] text-muted">
                        <Plate plate={v.plate} format={v.plateFormat} /> · {t(`vehicles.types.${v.type}`)}
                      </span>
                    </span>
                    {v.archivedAt ? (
                      <Badge tone="neutral">{t('vehicles.archived')}</Badge>
                    ) : v.device ? (
                      <DeviceStatusBadge status={v.device.status} />
                    ) : (
                      <Badge tone="attention">{t('vehicles.noDevice')}</Badge>
                    )}
                  </div>
                  {v.device && (
                    <p className="flex flex-wrap justify-between gap-x-3 text-[13px] text-muted">
                      <span>
                        {t('vehicles.colDevice')} <span className="ltr-isolate tabular-nums">…{v.device.imei.slice(-4)}</span>
                      </span>
                      <LastSeen at={v.device.lastSeenAt} />
                    </p>
                  )}
                  {writable && (
                    <div className="flex gap-1">
                      {!v.archivedAt && (
                        <Button variant="secondary" className="flex-1 text-sm" onClick={() => setEditing(v)} aria-label={`${t('common.edit')} ${v.name}`}>
                          {t('common.edit')}
                        </Button>
                      )}
                      <Button variant="ghost" className="flex-1 text-sm" onClick={() => void toggleArchive(v)} aria-label={`${t(v.archivedAt ? 'common.unarchive' : 'common.archive')} ${v.name}`}>
                        {t(v.archivedAt ? 'common.unarchive' : 'common.archive')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {shown.length > 0 && (
            <div className="relative hidden overflow-x-auto rounded-[20px] bg-surface sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>{t('vehicles.colVehicle')}</Th>
                    <Th>{t('vehicles.plate')}</Th>
                    <Th>{t('vehicles.colDevice')}</Th>
                    <Th>{t('vehicles.colState')}</Th>
                    <Th>{t('vehicles.colSignal')}</Th>
                    {writable && <Th>
                      <span className="sr-only">{t('common.actions')}</span>
                    </Th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((v) => (
                    <tr key={v.id} className="odd:bg-zebra">
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2">
                            <Icon name={v.type} size={18} />
                          </span>
                          <span className="max-w-[170px] min-w-0">
                            <strong className="block truncate">{v.name}</strong>
                            <span className="block truncate text-[13px] text-muted">
                              {t(`vehicles.types.${v.type}`)}
                              {v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(' ')}` : ''}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Plate plate={v.plate} format={v.plateFormat} />
                      </Td>
                      <Td className="text-muted">
                        {v.device ? <span className="ltr-isolate tabular-nums" title={v.device.imei}>…{v.device.imei.slice(-4)}</span> : '—'}
                      </Td>
                      <Td>
                        {v.archivedAt ? (
                          <Badge tone="neutral">{t('vehicles.archived')}</Badge>
                        ) : v.device ? (
                          <DeviceStatusBadge status={v.device.status} />
                        ) : (
                          <Badge tone="attention">{t('vehicles.noDevice')}</Badge>
                        )}
                      </Td>
                      <Td>{v.device ? <LastSeen at={v.device.lastSeenAt} /> : <span className="text-muted">—</span>}</Td>
                      {writable && (
                        <Td>
                          <span className="flex justify-end gap-1">
                            {!v.archivedAt && (
                              <button type="button" className="grid size-11 place-items-center rounded-[14px] hover:bg-surface-2" onClick={() => setEditing(v)} aria-label={`${t('common.edit')} ${v.name}`} title={t('common.edit')}>
                                <Icon name="edit" size={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="grid size-11 place-items-center rounded-[14px] hover:bg-surface-2"
                              onClick={() => void toggleArchive(v)}
                              aria-label={`${t(v.archivedAt ? 'common.unarchive' : 'common.archive')} ${v.name}`}
                              title={t(v.archivedAt ? 'common.unarchive' : 'common.archive')}
                            >
                              <Icon name={v.archivedAt ? 'unarchive' : 'archive'} size={18} />
                            </button>
                          </span>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {writable && (
          <QuickAdd
            canLinkDevice={can('devices.write')}
            onMore={() => setEditing('new')}
            onDone={async (n) => {
              setNotice(n);
              await reload();
            }}
          />
        )}
      </div>

      <VehicleDialog
        vehicle={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          setNotice({ tone: 'success', text: t('common.saved') });
          await reload();
        }}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-start text-[13px] font-bold whitespace-nowrap text-muted">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 whitespace-nowrap ${className ?? ''}`}>{children}</td>;
}

/**
 * "Add a vehicle": creates the vehicle, then (with an IMEI) registers the device or reuses an
 * unlinked one already in this organization, and links them. Each step uses the existing API,
 * with the same permissions and checks as the separate screens.
 */
function QuickAdd({ canLinkDevice, onMore, onDone }: { canLinkDevice: boolean; onMore: () => void; onDone: (n: { tone: 'success' | 'error'; text: string }) => Promise<void> }) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const imei = String(f.get('imei') ?? '').replace(/\s+/g, '');
    setBusy(true);
    setError(null);
    setFields({});
    let vehicle: VehicleDto;
    try {
      vehicle = await api<VehicleDto>(`/orgs/${org.orgId}/vehicles`, {
        method: 'POST',
        body: { type: f.get('type'), name: String(f.get('name') ?? '').trim(), plate: String(f.get('plate') ?? '').trim() },
      });
    } catch (err) {
      const r = errorText(err);
      setError(r.message);
      setFields(r.fields);
      setBusy(false);
      return;
    }
    if (!imei || !canLinkDevice) {
      setFormKey((k) => k + 1);
      setBusy(false);
      await onDone({ tone: 'success', text: t('vehicles.added', { name: vehicle.name }) });
      return;
    }
    try {
      const devices = await api<DeviceDto[]>(`/orgs/${org.orgId}/devices`);
      let device = devices.find((d) => d.imei === imei);
      if (device?.vehicle) throw new ApiError(409, 'device.already_linked');
      device ??= await api<DeviceDto>(`/orgs/${org.orgId}/devices`, { method: 'POST', body: { imei } });
      await api(`/orgs/${org.orgId}/devices/${device.id}/link`, { method: 'POST', body: { vehicleId: vehicle.id } });
      setFormKey((k) => k + 1);
      await onDone({ tone: 'success', text: t('vehicles.addedLinked', { name: vehicle.name }) });
    } catch (err) {
      // The vehicle exists; only the device step failed. Say exactly that.
      setFormKey((k) => k + 1);
      await onDone({ tone: 'error', text: t('vehicles.addedNotLinked', { name: vehicle.name, reason: errorText(err).message }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-[20px] bg-surface p-5" aria-labelledby="quick-add">
      <h2 id="quick-add" className="h-display text-[25px]">
        {t('vehicles.add')}
      </h2>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label={t('vehicles.type')}>
        {(p) => (
          <Select {...p} name="type" defaultValue="car">
            {VEHICLE_TYPES.map((vt) => (
              <option key={vt} value={vt}>
                {t(`vehicles.types.${vt}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('vehicles.name')} error={fields.name}>
        {(p) => <Input {...p} name="name" placeholder={t('vehicles.namePlaceholder')} required maxLength={80} />}
      </Field>
      <Field label={t('vehicles.plate')} error={fields.plate}>
        {(p) => <Input {...p} name="plate" placeholder={t('vehicles.platePlaceholder')} required dir="ltr" maxLength={30} />}
      </Field>
      {canLinkDevice && (
        <Field label={t('vehicles.imei')} hint={t('vehicles.imeiHint')} optional>
          {(p) => <Input {...p} name="imei" inputMode="numeric" autoComplete="off" dir="ltr" maxLength={24} />}
        </Field>
      )}
      <Button type="submit" busy={busy}>
        {canLinkDevice ? t('vehicles.addAndLink') : t('vehicles.add')}
      </Button>
      <button type="button" onClick={onMore} className="min-h-11 text-sm font-bold text-muted underline-offset-4 hover:text-ink hover:underline">
        {t('vehicles.moreOptions')}
      </button>
    </form>
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
          <legend className="mb-2 text-sm font-semibold">{t('vehicles.type')}</legend>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((vt) => (
              <label key={vt} className="cursor-pointer">
                <input type="radio" name="type" value={vt} defaultChecked={(v?.type ?? 'car') === vt} className="peer sr-only" />
                <span className="inline-flex min-h-11 items-center rounded-full bg-surface-2 px-4 text-sm font-semibold peer-checked:bg-ink peer-checked:text-canvas peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--acc)]">
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
