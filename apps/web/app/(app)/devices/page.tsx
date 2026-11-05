'use client';

import type { DeviceDto, VehicleDto } from '@winou/shared';
import { useState, type FormEvent } from 'react';
import { DeviceStatusBadge, LastSeen, Plate } from '@/components/fleet-bits';
import { FleetTabs } from '@/components/fleet-tabs';
import { LoadError } from '@/components/load-error';
import { Badge, Button, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

export default function DevicesPage() {
  const { t } = useI18n();
  const { org, can } = useSession();
  const errorText = useErrorText();
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<DeviceDto | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const { data, loading, error, reload } = useApiData<DeviceDto[]>(`/orgs/${org.orgId}/devices${archived ? '?archived=true' : ''}`);
  const writable = can('devices.write');

  async function act(d: DeviceDto, action: 'unlink' | 'archive') {
    const confirmText = action === 'unlink' ? t('devices.confirmUnlink') : t('common.confirmArchive');
    if (!window.confirm(confirmText)) return;
    try {
      await api(`/orgs/${org.orgId}/devices/${d.id}/${action}`, { method: 'POST' });
      setNotice({ tone: 'info', text: t('common.saved') });
      await reload();
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e).message });
    }
  }

  return (
    <div className="fade-in">
      <PageHeader title={t('vehicles.pageTitle')} actions={writable && <Button onClick={() => setAdding(true)}>{t('devices.add')}</Button>} />
      <FleetTabs />
      <label className="mb-4 flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5 accent-[var(--acc)]" />
        {t('devices.showArchived')}
      </label>
      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      {error && !data ? <LoadError onRetry={() => void reload()} /> : null}
      {loading && !data && <p role="status" className="text-muted">{t('common.loading')}</p>}
      {data && data.length === 0 && <EmptyState>{t('devices.empty')}</EmptyState>}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-2 sm:hidden" aria-label={t('devices.title')}>
          {data.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-[20px] bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="ltr-isolate tabular-nums">{d.imei}</strong>
                {d.archivedAt ? <Badge tone="neutral">{t('vehicles.archived')}</Badge> : <DeviceStatusBadge status={d.status} />}
              </div>
              {(d.label || d.model) && <p className="text-[13px] text-muted">{[d.label, d.model].filter(Boolean).join(' · ')}</p>}
              <p className="flex flex-wrap justify-between gap-x-3 text-[13px] text-muted">
                <span>
                  {t('devices.linkedTo')} <span className="font-semibold text-ink">{d.vehicle ? d.vehicle.name : t('common.none')}</span>
                </span>
                <LastSeen at={d.lastSeenAt} />
              </p>
              {writable && !d.archivedAt && (
                <div className="flex gap-1">
                  {d.vehicle ? (
                    <Button variant="secondary" className="flex-1 text-sm" onClick={() => void act(d, 'unlink')} aria-label={`${t('devices.unlink')} ${d.imei}`}>
                      {t('devices.unlink')}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="flex-1 text-sm" onClick={() => setLinking(d)} aria-label={`${t('devices.link')} ${d.imei}`}>
                      {t('devices.link')}
                    </Button>
                  )}
                  <Button variant="ghost" className="flex-1 text-sm" onClick={() => void act(d, 'archive')} aria-label={`${t('common.archive')} ${d.imei}`}>
                    {t('common.archive')}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.length > 0 && (
        <div className="relative hidden overflow-x-auto rounded-[20px] bg-surface sm:block">
          <table className="w-full min-w-[720px] border-collapse text-start">
            <thead>
              <tr className="text-[13px] text-muted">
                <th scope="col" className="px-4 py-3 text-start font-bold">{t('devices.imei')}</th>
                <th scope="col" className="px-4 py-3 text-start font-bold">{t('devices.status')}</th>
                <th scope="col" className="px-4 py-3 text-start font-bold">{t('devices.lastSeen')}</th>
                <th scope="col" className="px-4 py-3 text-start font-bold">{t('devices.linkedTo')}</th>
                {writable && <th scope="col" className="px-4 py-3 text-end font-bold"><span className="sr-only">{t('common.actions')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="odd:bg-zebra">
                  <td className="px-4 py-3">
                    <p className="ltr-isolate font-semibold tabular-nums">{d.imei}</p>
                    {(d.label || d.model) && <p className="text-sm text-muted">{[d.label, d.model].filter(Boolean).join(' · ')}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {d.archivedAt ? <Badge tone="neutral">{t('vehicles.archived')}</Badge> : <DeviceStatusBadge status={d.status} />}
                  </td>
                  <td className="px-4 py-3">
                    <LastSeen at={d.lastSeenAt} />
                  </td>
                  <td className="px-4 py-3">
                    {d.vehicle ? (
                      <span>
                        <span className="font-medium">{d.vehicle.name}</span>
                        <span className="block text-sm text-muted">
                          <Plate plate={d.vehicle.plate} format="tn_standard" />
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">{t('common.none')}</span>
                    )}
                  </td>
                  {writable && (
                    <td className="px-4 py-3">
                      {!d.archivedAt && (
                        <div className="flex justify-end gap-2">
                          {d.vehicle ? (
                            <Button variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => void act(d, 'unlink')} aria-label={`${t('devices.unlink')} ${d.imei}`}>
                              {t('devices.unlink')}
                            </Button>
                          ) : (
                            <Button variant="secondary" className="min-h-11 px-3 text-sm" onClick={() => setLinking(d)} aria-label={`${t('devices.link')} ${d.imei}`}>
                              {t('devices.link')}
                            </Button>
                          )}
                          <Button variant="ghost" className="min-h-11 px-3 text-sm" onClick={() => void act(d, 'archive')} aria-label={`${t('common.archive')} ${d.imei}`}>
                            {t('common.archive')}
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddDeviceDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          setNotice({ tone: 'info', text: t('common.saved') });
          await reload();
        }}
      />
      <LinkDialog
        device={linking}
        onClose={() => setLinking(null)}
        onSaved={async () => {
          setLinking(null);
          setNotice({ tone: 'info', text: t('common.saved') });
          await reload();
        }}
      />
    </div>
  );
}

function AddDeviceDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const opt = (k: string) => String(f.get(k) ?? '').trim() || null;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/orgs/${org.orgId}/devices`, { method: 'POST', body: { imei: f.get('imei'), label: opt('label'), model: opt('model') } });
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
    <Dialog open={open} onClose={onClose} title={t('devices.add')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label={t('devices.imei')} hint={t('devices.imeiHelp')} error={fields.imei}>
          {(p) => <Input {...p} name="imei" inputMode="numeric" autoComplete="off" required dir="ltr" maxLength={20} />}
        </Field>
        <Field label={t('devices.label')} optional>
          {(p) => <Input {...p} name="label" maxLength={80} />}
        </Field>
        <Field label={t('devices.model')} optional>
          {(p) => <Input {...p} name="model" maxLength={80} />}
        </Field>
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

function LinkDialog({ device, onClose, onSaved }: { device: DeviceDto | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const { org } = useSession();
  const errorText = useErrorText();
  const vehicles = useApiData<VehicleDto[]>(device ? `/orgs/${org.orgId}/vehicles` : null);
  const free = (vehicles.data ?? []).filter((v) => !v.device);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!device) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/orgs/${org.orgId}/devices/${device.id}/link`, {
        method: 'POST',
        body: { vehicleId: new FormData(e.currentTarget).get('vehicleId') },
      });
      await onSaved();
    } catch (err) {
      setError(errorText(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={device !== null} onClose={onClose} title={t('devices.linkTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-muted">
          {t('devices.imei')} <span className="ltr-isolate font-semibold text-ink">{device?.imei}</span>
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {vehicles.data && free.length === 0 ? (
          <Notice>{t('devices.noFreeVehicle')}</Notice>
        ) : (
          <Field label={t('devices.chooseVehicle')}>
            {(p) => (
              <Select {...p} name="vehicleId" required>
                {free.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.plate}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" busy={busy} disabled={free.length === 0}>
            {t('devices.link')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
