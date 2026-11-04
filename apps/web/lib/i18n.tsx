'use client';

import { interpolate, isRtl, messages, type Messages, type SupportedLocale } from '@winou/i18n';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { LOCALE_COOKIE, TIMEZONE } from './locale';

export { LOCALE_COOKIE, TIMEZONE };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

interface I18nValue {
  locale: SupportedLocale;
  dir: 'rtl' | 'ltr';
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Translate a dynamic key (e.g. an API error code) with a fallback. */
  tx: (key: string, fallback?: string) => string;
  formatDateTime: (iso: string | Date) => string;
  formatDate: (iso: string | Date) => string;
  formatTime: (iso: string | Date) => string;
  formatRelative: (iso: string | Date) => string;
  setLocale: (l: SupportedLocale) => void;
}

const Ctx = createContext<I18nValue | null>(null);

function lookup(locale: SupportedLocale, key: string): string | undefined {
  // Keys may contain dots inside a segment (audit.vehicle.created, errors.imei.invalid):
  // walk greedily, trying the longest remaining key at each level.
  let node: unknown = messages[locale];
  const parts = key.split('.');
  let i = 0;
  while (i < parts.length && node && typeof node === 'object') {
    let found = false;
    for (let j = parts.length; j > i; j--) {
      const k = parts.slice(i, j).join('.');
      if (k in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[k];
        i = j;
        found = true;
        break;
      }
    }
    if (!found) return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function I18nProvider({ locale, children }: { locale: SupportedLocale; children: ReactNode }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      interpolate(lookup(locale, key) ?? lookup('fr', key) ?? key, vars),
    [locale],
  );
  const value = useMemo<I18nValue>(() => {
    const intlLocale = locale === 'ar' ? 'ar-TN-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-TN';
    const dt = new Intl.DateTimeFormat(intlLocale, { timeZone: TIMEZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
    const d = new Intl.DateTimeFormat(intlLocale, { timeZone: TIMEZONE, dateStyle: 'medium' });
    const tm = new Intl.DateTimeFormat(intlLocale, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const rel = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    return {
      locale,
      dir: isRtl(locale) ? 'rtl' : 'ltr',
      t: t as I18nValue['t'],
      tx: (key, fallback) => lookup(locale, key) ?? lookup('fr', key) ?? fallback ?? key,
      formatDateTime: (v) => dt.format(new Date(v)),
      formatDate: (v) => d.format(new Date(v)),
      formatTime: (v) => tm.format(new Date(v)),
      formatRelative: (v) => {
        const s = Math.round((new Date(v).getTime() - Date.now()) / 1000);
        const abs = Math.abs(s);
        if (abs < 60) return rel.format(s, 'second');
        if (abs < 3600) return rel.format(Math.round(s / 60), 'minute');
        if (abs < 86400) return rel.format(Math.round(s / 3600), 'hour');
        return rel.format(Math.round(s / 86400), 'day');
      },
      setLocale: (l) => {
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      },
    };
  }, [locale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
