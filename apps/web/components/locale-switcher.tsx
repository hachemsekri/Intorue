'use client';

import type { SupportedLocale } from '@winou/i18n';
import { useId } from 'react';
import { useI18n } from '@/lib/i18n';

const LABELS: Record<SupportedLocale, string> = { fr: 'Français', ar: 'العربية', en: 'English' };

export function LocaleSwitcher({ inline }: { inline?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const id = useId();
  return (
    <div className={inline ? 'flex items-center gap-2' : 'flex flex-col gap-1'}>
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">
        {t('common.language')}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(e) => setLocale(e.target.value as SupportedLocale)}
        className="min-h-11 w-full rounded-xl border-2 border-transparent bg-surface-2 px-2 text-sm font-medium text-ink focus:border-acc"
      >
        {(Object.keys(LABELS) as SupportedLocale[]).map((l) => (
          <option key={l} value={l} lang={l}>
            {LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
