import type { PlateFormat } from './enums';

/**
 * Tunisian licence plates.
 *
 * - tn_standard: "245 TUN 7812": serial (1-3 digits), the word تونس (TUN), number (1-4 digits).
 *   Written right-to-left on the physical plate; we store it in Latin form.
 * - tn_rs: "123456 RS": régime suspensif (temporary import), up to 6 digits.
 * - other: anything else (diplomatic, government, unregistered scooters…), stored as typed.
 *
 * ASSUMPTION (docs/ASSUMPTIONS.md): motorcycle, diplomatic and temporary formats still need
 * verification and are accepted as "other" for now.
 */
const STANDARD = /^(\d{1,3})\s*(?:TUN|TU|تونس)\s*(\d{1,4})$/iu;
const STANDARD_REVERSED = /^(\d{1,4})\s*تونس\s*(\d{1,3})$/u; // Arabic text pasted RTL
const RS = /^(\d{1,6})\s*(?:RS|ن\s*ت)$/iu;

export interface ParsedPlate {
  format: PlateFormat;
  /** Canonical Latin representation, used for storage, search and uniqueness. */
  normalized: string;
}

export function parsePlate(input: string, format?: PlateFormat): ParsedPlate | null {
  // Drop invisible format marks (LRM, RLM…) that come along when Arabic text is copied.
  const cleaned = input.trim().replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ');
  // Separators are ignored for Tunisian formats but kept for free-form plates ("TR-014").
  const raw = cleaned.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return null;

  if (format === undefined || format === 'tn_standard') {
    const m = STANDARD.exec(raw);
    if (m) return { format: 'tn_standard', normalized: `${Number(m[1])} TUN ${Number(m[2])}` };
    const r = STANDARD_REVERSED.exec(raw);
    if (r && format === 'tn_standard') {
      return { format: 'tn_standard', normalized: `${Number(r[2])} TUN ${Number(r[1])}` };
    }
    if (format === 'tn_standard') return null;
  }
  if (format === undefined || format === 'tn_rs') {
    const m = RS.exec(raw);
    if (m) return { format: 'tn_rs', normalized: `${Number(m[1])} RS` };
    if (format === 'tn_rs') return null;
  }
  if (cleaned.length > 20) return null;
  return { format: 'other', normalized: cleaned.toUpperCase() };
}

/** Display a normalized plate for a locale. Arabic shows "تونس" in place of "TUN". */
export function formatPlate(normalized: string, format: PlateFormat, locale: string): string {
  if (format === 'tn_standard' && locale === 'ar') return normalized.replace('TUN', 'تونس');
  if (format === 'tn_rs' && locale === 'ar') return normalized.replace('RS', 'ن ت');
  return normalized;
}
