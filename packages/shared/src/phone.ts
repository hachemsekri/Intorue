/**
 * Phone numbers for reservations (and later, contact details).
 * Tunisian numbers have 8 digits and start with 2–9; they are stored as +216XXXXXXXX.
 * Other international numbers are accepted with a leading + (or 00) and 8–15 digits.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 30) return null;
  if (!/^[+\d\s().\-/]+$/.test(raw)) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g)?.length ?? 0) > 1) return null;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) {
    if (/^[2-9]\d{7}$/.test(digits)) return `+216${digits}`;
    if (/^216[2-9]\d{7}$/.test(digits)) return `+${digits}`;
    return null;
  }
  if (digits.startsWith('+216')) return /^\+216[2-9]\d{7}$/.test(digits) ? digits : null;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
