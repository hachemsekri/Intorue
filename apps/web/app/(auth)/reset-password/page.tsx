'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function ResetForm() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const token = useSearchParams().get('token') ?? '';
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: new FormData(e.currentTarget).get('password') } });
      setDone(true);
    } catch (err) {
      const r = errorText(err);
      setError(r.message);
      setFieldError(r.fields.password);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="h-display mb-7 text-[clamp(36px,5vw,48px)]">{t('auth.resetTitle')}</h1>
      {done ? (
        <Notice tone="success">{t('auth.resetDone')}</Notice>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={fieldError}>
            {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" required minLength={10} />}
          </Field>
          <Button type="submit" busy={busy} disabled={!token}>
            {t('auth.resetSubmit')}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-8 text-center font-semibold text-ink underline-offset-4 hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
