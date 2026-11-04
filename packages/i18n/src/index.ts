import { fr, type Messages } from './fr';
import { ar } from './ar';
import { en } from './en';

export type { Messages };
export const messages = { fr, ar, en } as const;
export type SupportedLocale = keyof typeof messages;

export function isRtl(locale: string): boolean {
  return locale === 'ar';
}

/** Replaces {name} placeholders. */
export function interpolate(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`));
}
