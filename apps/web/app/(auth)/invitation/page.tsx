'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * Invitation link target. Signed-in users accept directly; new users create an account
 * that joins the inviting organization.
 */
function InvitationForm() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const token = useSearchParams().get('token') ?? '';
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => setSignedIn(r.ok))
      .catch(() => setSignedIn(false));
  }, []);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api('/invitations/accept', { method: 'POST', body: { token } });
      window.location.href = '/map';
    } catch (err) {
      setError(errorText(err).message);
      setBusy(false);
    }
  }

  async function signup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: {
          name: f.get('name'),
          email: f.get('email'),
          password: f.get('password'),
          invitationToken: token,
          acceptTerms: f.get('acceptTerms') === 'on',
          locale,
        },
      });
      window.location.href = '/map';
    } catch (err) {
      const r = errorText(err);
      setError(r.message);
      setFields(r.fields);
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('auth.invitationTitle')}</h1>
      <p className="mt-2 mb-8 text-muted">{t('auth.invitationBody')}</p>
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {signedIn === null ? null : signedIn ? (
        <Button onClick={accept} busy={busy} disabled={!token}>
          {t('auth.acceptInvitation')}
        </Button>
      ) : (
        <form onSubmit={signup} className="flex flex-col gap-5" noValidate>
          <Field label={t('auth.name')} error={fields.name}>
            {(p) => <Input {...p} name="name" autoComplete="name" required />}
          </Field>
          <Field label={t('auth.email')} error={fields.email}>
            {(p) => <Input {...p} name="email" type="email" autoComplete="email" required dir="ltr" />}
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={fields.password}>
            {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" required />}
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 size-5 accent-navy" required />
            <span>
              {t('auth.acceptTerms')}
              <span className="mt-1 block text-xs text-muted">{t('auth.termsPlaceholder')}</span>
            </span>
          </label>
          <Button type="submit" busy={busy} disabled={!token}>
            {t('auth.acceptInvitation')}
          </Button>
          <p className="text-center text-muted">
            {t('auth.haveAccount')}{' '}
            <Link
              href={`/login?next=${encodeURIComponent(`/invitation?token=${token}`)}`}
              className="font-semibold text-navy underline-offset-4 hover:underline"
            >
              {t('auth.signIn')}
            </Link>
          </p>
        </form>
      )}
    </>
  );
}

export default function InvitationPage() {
  return (
    <Suspense>
      <InvitationForm />
    </Suspense>
  );
}
