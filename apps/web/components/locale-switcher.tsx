'use client';

import type { SupportedLocale } from '@winou/i18n';
import { useId } from 'react';
import { useI18n } from '@/lib/i18n';

const LABELS: Record<SupportedLocale, string> = { fr: 'Français', ar: 'العربية', en: 'English' };

export function LocaleSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { locale, setLocale, t } = useI18n();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className={`text-sm ${tone === 'light' ? 'text-white/70' : 'text-muted'}`}>
        {t('common.language')}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(e) => setLocale(e.target.value as SupportedLocale)}
        className={`min-h-10 rounded-lg px-2 text-sm ${tone === 'light' ? 'bg-navy-soft text-white' : 'border border-line bg-white text-navy'}`}
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
