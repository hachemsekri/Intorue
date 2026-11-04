'use client';

import { RETENTION_DAYS, type AuditEntryDto, type OrgDto } from '@winou/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, Notice, PageHeader, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

export default function SettingsPage() {
  const { t, tx, formatDateTime } = useI18n();
  const { org, can, reload, switchOrg } = useSession();
  const errorText = useErrorText();
  const orgData = useApiData<OrgDto>(`/orgs/${org.orgId}`);
  const audit = useApiData<AuditEntryDto[]>(can('audit.read') ? `/orgs/${org.orgId}/audit-log?limit=50` : null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const editable = can('org.update');

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setFields({});
    try {
      await api(`/orgs/${org.orgId}`, {
        method: 'PATCH',
        body: { name: String(f.get('name')), locationRetentionDays: Number(f.get('retention')) },
      });
      setNotice({ tone: 'success', text: t('common.saved') });
      await Promise.all([orgData.reload(), reload(), audit.reload()]);
    } catch (err) {
      const r = errorText(err);
      setNotice({ tone: 'error', text: r.message });
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  async function createOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      const created = await api<OrgDto>('/orgs', { method: 'POST', body: { name: String(new FormData(form).get('newOrg')) } });
      form.reset();
      await reload();
      switchOrg(created.id);
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err).message });
    }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} />
      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          {orgData.data && (
            <Card className="p-5">
              <form key={orgData.data.id} onSubmit={save} className="flex flex-col gap-4" noValidate>
                <Field label={t('settings.orgName')} error={fields.name}>
                  {(p) => <Input {...p} name="name" defaultValue={orgData.data!.name} disabled={!editable} required />}
                </Field>
                <Field
                  label={t('settings.retention')}
                  hint={t('settings.retentionHelp', { min: RETENTION_DAYS.min, max: RETENTION_DAYS.max })}
                  error={fields.locationRetentionDays}
                >
                  {(p) => (
                    <Input
                      {...p}
                      name="retention"
                      type="number"
                      inputMode="numeric"
                      min={RETENTION_DAYS.min}
                      max={RETENTION_DAYS.max}
                      defaultValue={orgData.data!.locationRetentionDays}
                      disabled={!editable}
                      className="w-40"
                    />
                  )}
                </Field>
                {editable && (
                  <Button type="submit" busy={busy} className="self-start">
                    {t('common.save')}
                  </Button>
                )}
              </form>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-2 text-lg font-bold">{t('settings.privacy')}</h2>
            <p className="text-sm text-muted">{t('settings.privacyPlaceholder')}</p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-bold">{t('settings.createOrg')}</h2>
            <form onSubmit={createOrg} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label={t('auth.orgName')}>{(p) => <Input {...p} name="newOrg" required minLength={2} maxLength={120} />}</Field>
              </div>
              <Button type="submit" variant="secondary">
                {t('settings.createOrg')}
              </Button>
            </form>
          </Card>
        </div>

        {can('audit.read') && (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-bold">{t('settings.auditLog')}</h2>
            {audit.data && audit.data.length === 0 && <p className="text-muted">{t('settings.auditEmpty')}</p>}
            <ol className="flex flex-col">
              {(audit.data ?? []).map((e) => (
                <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-4 border-b border-line py-3 last:border-0">
                  <time dateTime={e.at} className="text-sm tabular-nums text-muted">
                    {formatDateTime(e.at)}
                  </time>
                  <div>
                    <p className="font-semibold">{tx(`audit.${e.action}`, e.action)}</p>
                    <p className="text-sm text-muted">
                      {e.actor?.name ?? t('common.none')}
                      {typeof e.metadata.imei === 'string' && (
                        <>
                          {' · '}
                          <span className="ltr-isolate">{e.metadata.imei}</span>
                        </>
                      )}
                      {typeof e.metadata.plate === 'string' && (
                        <>
                          {' · '}
                          <span className="ltr-isolate">{e.metadata.plate}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </>
  );
}
