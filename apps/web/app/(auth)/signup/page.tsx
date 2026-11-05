'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, cx, useErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function SignupPage() {
  const { t, locale } = useI18n();
  const errorText = useErrorText();
  const [kind, setKind] = useState<'personal' | 'business'>('personal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: {
          name: f.get('name'),
          email: f.get('email'),
          password: f.get('password'),
          accountKind: kind,
          orgName: kind === 'business' ? f.get('orgName') : undefined,
          acceptTerms: f.get('acceptTerms') === 'on',
          locale,
        },
      });
      window.location.href = '/map';
    } catch (err) {
      const { message, fields } = errorText(err);
      setError(message);
      setFields(fields);
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="h-display mb-7 text-[clamp(36px,5vw,48px)]">{t('auth.signUpTitle')}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">{t('auth.accountKind')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['personal', 'business'] as const).map((k) => (
              <label
                key={k}
                className={cx(
                  'cursor-pointer rounded-xl border-2 bg-surface p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--acc)]',
                  kind === k ? 'border-ink' : 'border-line hover:border-muted/40',
                )}
              >
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                <span className="block font-bold">{t(k === 'personal' ? 'auth.personal' : 'auth.business')}</span>
                <span className="mt-1 block text-sm text-muted">{t(k === 'personal' ? 'auth.personalHelp' : 'auth.businessHelp')}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('auth.name')} error={fields.name}>
          {(p) => <Input {...p} name="name" autoComplete="name" required />}
        </Field>
        {kind === 'business' && (
          <Field label={t('auth.orgName')} error={fields.orgName}>
            {(p) => <Input {...p} name="orgName" autoComplete="organization" required />}
          </Field>
        )}
        <Field label={t('auth.email')} error={fields.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" required dir="ltr" />}
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={fields.password}>
          {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" required minLength={10} />}
        </Field>
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="acceptTerms" className="mt-0.5 size-5 accent-[var(--acc)]" required />
            <span>
              {t('auth.acceptTerms')}
              <span className="mt-1 block text-xs text-muted">{t('auth.termsPlaceholder')}</span>
            </span>
          </label>
          {fields.acceptTerms && <p className="mt-1 text-sm text-danger">{fields.acceptTerms}</p>}
        </div>
        <Button type="submit" busy={busy}>
          {t('auth.createAccount')}
        </Button>
      </form>
      <p className="mt-8 text-center text-muted">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </>
  );
}
