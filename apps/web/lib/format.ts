import { TIMEZONE } from './locale';

/** "312 km", "12,4 km", "850 m" */
export function formatDistance(m: number, locale: string): string {
  const nf = (d: number) => new Intl.NumberFormat(intl(locale), { maximumFractionDigits: d });
  if (m < 1000) return `${nf(0).format(Math.round(m / 10) * 10)} m`;
  return `${nf(m < 100_000 ? 1 : 0).format(m / 1000)} km`;
}

/** "5 h 40", "45 min", "30 s" */
export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

export const intl = (locale: string) => (locale === 'ar' ? 'ar-TN-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-TN');

/** Midnight of the given day in Tunis time (offset read from the time zone database). */
export function startOfDayTunis(d: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? 'GMT+01:00').replace('GMT', '') || '+00:00';
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00${offset}`);
}

/** "YYYY-MM-DD" of a date in Tunis time, for <input type="date">. */
export function ymdTunis(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function fromYmdTunis(ymd: string): Date {
  return startOfDayTunis(new Date(`${ymd}T12:00:00Z`));
}
