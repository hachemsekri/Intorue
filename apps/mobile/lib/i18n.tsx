import { interpolate, isRtl, messages, type Messages, type SupportedLocale } from '@winou/i18n';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DevSettings, I18nManager, Platform } from 'react-native';
import { prefs } from './storage';

const TIMEZONE = 'Africa/Tunis';
const KEY = 'winou.locale';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<Messages>;

function lookup(locale: SupportedLocale, key: string): string | undefined {
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

interface I18nValue {
  locale: SupportedLocale;
  rtl: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tx: (key: string, fallback?: string) => string;
  formatRelative: (iso: string) => string;
  formatTime: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  setLocale: (l: SupportedLocale) => Promise<void>;
}

const Ctx = createContext<I18nValue | null>(null);

/** French by default (product language); Arabic if the phone is set to Arabic. English is chosen in Compte. */
function deviceLocale(): SupportedLocale {
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'fr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<SupportedLocale | null>(null);

  useEffect(() => {
    void prefs.getItem(KEY).then((saved) => setLoc(saved && saved in messages ? (saved as SupportedLocale) : deviceLocale()));
  }, []);

  useEffect(() => {
    if (!locale) return;
    const rtl = isRtl(locale);
    if (Platform.OS === 'web') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
    } else if (I18nManager.isRTL !== rtl) {
      // React Native applies a direction change after a reload.
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      if (__DEV__) DevSettings.reload();
    }
  }, [locale]);

  const value = useMemo<I18nValue | null>(() => {
    if (!locale) return null;
    const intl = locale === 'ar' ? 'ar-TN-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-TN';
    const rel = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
    const tm = new Intl.DateTimeFormat(intl, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const dt = new Intl.DateTimeFormat(intl, { timeZone: TIMEZONE, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' });
    return {
      locale,
      rtl: isRtl(locale),
      t: (key, vars) => interpolate(lookup(locale, key) ?? lookup('fr', key) ?? key, vars),
      tx: (key, fallback) => lookup(locale, key) ?? lookup('fr', key) ?? fallback ?? key,
      formatTime: (v) => tm.format(new Date(v)),
      formatDateTime: (v) => dt.format(new Date(v)),
      formatRelative: (v) => {
        const s = Math.round((new Date(v).getTime() - Date.now()) / 1000);
        const a = Math.abs(s);
        if (a < 60) return rel.format(s, 'second');
        if (a < 3600) return rel.format(Math.round(s / 60), 'minute');
        if (a < 86400) return rel.format(Math.round(s / 3600), 'hour');
        return rel.format(Math.round(s / 86400), 'day');
      },
      setLocale: async (l) => {
        await prefs.setItem(KEY, l);
        setLoc(l);
      },
    };
  }, [locale]);

  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
