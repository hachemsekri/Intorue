'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: new FormData(e.currentTarget).get('email') } });
      setSent(true);
    } catch (err) {
      setError(errorText(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{t('auth.forgotTitle')}</h1>
      <p className="mt-2 mb-8 text-muted">{t('auth.forgotHelp')}</p>
      {sent ? (
        <Notice tone="success">{t('auth.linkSent')}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label={t('auth.email')}>{(p) => <Input {...p} name="email" type="email" autoComplete="email" required dir="ltr" />}</Field>
          <Button type="submit" busy={busy}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-8 text-center font-semibold text-navy underline-offset-4 hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </>
  );
}
