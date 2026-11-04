'use client';

import { ROLES, type InvitationDto, type MemberDto, type Role } from '@winou/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Input, Notice, PageHeader, Select, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApiData, useSession } from '@/lib/session';

export default function MembersPage() {
  const { t, formatDate } = useI18n();
  const { org, me, can } = useSession();
  const errorText = useErrorText();
  const members = useApiData<MemberDto[]>(`/orgs/${org.orgId}/members`);
  const invitations = useApiData<InvitationDto[]>(`/orgs/${org.orgId}/invitations`);
  const manage = can('members.manage');
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      setNotice({ tone: 'success', text: ok });
      await Promise.all([members.reload(), invitations.reload()]);
    } catch (e) {
      setNotice({ tone: 'error', text: errorText(e).message });
    }
  }

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setFields({});
    try {
      await api(`/orgs/${org.orgId}/invitations`, { method: 'POST', body: { email: f.get('email'), role: f.get('role') } });
      form.reset();
      setNotice({ tone: 'success', text: t('members.inviteSent') });
      await invitations.reload();
    } catch (err) {
      const r = errorText(err);
      setNotice({ tone: 'error', text: r.message });
      setFields(r.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t('members.title')} subtitle={org.orgName} />
      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <ul aria-label={t('members.title')}>
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {m.name} {m.userId === me.id && <span className="font-normal text-muted">({t('members.you')})</span>}
                  </p>
                  <p className="ltr-isolate truncate text-sm text-muted">{m.email}</p>
                  <p className="text-xs text-muted">
                    {t('members.joined')} {formatDate(m.joinedAt)}
                  </p>
                </div>
                {manage ? (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${m.userId}`}>
                      {t('members.role')} {m.name}
                    </label>
                    <Select
                      id={`role-${m.userId}`}
                      value={m.role}
                      className="w-44"
                      onChange={(e) =>
                        void run(
                          () => api(`/orgs/${org.orgId}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value as Role } }),
                          t('common.saved'),
                        )
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`members.roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                    {m.userId !== me.id && (
                      <Button
                        variant="danger"
                        className="min-h-11 px-3 text-sm"
                        aria-label={`${t('common.remove')} ${m.name}`}
                        onClick={() => {
                          if (window.confirm(t('members.confirmRemove')))
                            void run(() => api(`/orgs/${org.orgId}/members/${m.userId}`, { method: 'DELETE' }), t('common.saved'));
                        }}
                      >
                        {t('common.remove')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-sm font-semibold">{t(`members.roles.${m.role}`)}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {manage && (
          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <h2 className="mb-4 text-lg font-bold">{t('members.invite')}</h2>
              <form onSubmit={invite} className="flex flex-col gap-4" noValidate>
                <Field label={t('members.email')} error={fields.email}>
                  {(p) => <Input {...p} name="email" type="email" required dir="ltr" autoComplete="off" />}
                </Field>
                <Field label={t('members.role')}>
                  {(p) => (
                    <Select {...p} name="role" defaultValue="viewer">
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`members.roles.${r}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <ul className="text-xs text-muted">
                  {ROLES.map((r) => (
                    <li key={r}>
                      <span className="font-semibold">{t(`members.roles.${r}`)}</span> : {t(`members.roleHelp.${r}`)}
                    </li>
                  ))}
                </ul>
                <Button type="submit" busy={busy}>
                  {t('members.invite')}
                </Button>
              </form>
            </Card>

            {(invitations.data ?? []).length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 text-lg font-bold">{t('members.pending')}</h2>
                <ul className="flex flex-col gap-3">
                  {invitations.data!.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="ltr-isolate truncate font-medium">{i.email}</p>
                        <p className="text-xs text-muted">
                          {t(`members.roles.${i.role}`)} · {t('members.expires', { date: formatDate(i.expiresAt) })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        className="min-h-10 px-3 text-sm"
                        aria-label={`${t('members.revoke')} ${i.email}`}
                        onClick={() => void run(() => api(`/orgs/${org.orgId}/invitations/${i.id}`, { method: 'DELETE' }), t('common.saved'))}
                      >
                        {t('members.revoke')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
