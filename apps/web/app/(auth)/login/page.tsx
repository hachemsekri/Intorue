'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function LoginForm() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } });
      const next = params.get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/map';
    } catch (err) {
      setError(errorText(err).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('auth.signInTitle')}</h1>
      <p className="mt-1 mb-8 text-muted">{t('auth.signInSubtitle')}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label={t('auth.email')}>{(p) => <Input {...p} name="email" type="email" autoComplete="email" required dir="ltr" />}</Field>
        <Field label={t('auth.password')}>
          {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
        </Field>
        <div className="-mt-2 text-end">
          <Link href="/forgot-password" className="text-sm font-medium text-teal-dark underline-offset-4 hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" busy={busy}>
          {t('auth.signIn')}
        </Button>
      </form>
      <p className="mt-8 text-center text-muted">
        {t('auth.noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-navy underline-offset-4 hover:underline">
          {t('auth.createAccount')}
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
