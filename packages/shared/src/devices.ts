import { DEFAULT_OFFLINE_AFTER_MINUTES, type DeviceStatus } from './enums';

/**
 * Device identifier as entered by the customer: 8–20 digits (spaces and dashes ignored).
 * Usually the 15-digit IMEI, but some trackers report a shorter ID (e.g. 10 or 12 digits),
 * and labels are sometimes printed without the check digit, so the Luhn check is not enforced.
 */
export function isValidDeviceId(id: string): boolean {
  return /^\d{8,20}$/.test(id);
}

/** IMEI: 15 digits with a valid Luhn check digit (used by the simulator and as a hint). */
export function isValidImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Appends a Luhn check digit to a 14-digit body. Used by the simulator and tests. */
export function imeiWithCheckDigit(body14: string): string {
  if (!/^\d{14}$/.test(body14)) throw new Error('IMEI body must be 14 digits');
  for (let c = 0; c <= 9; c++) {
    const candidate = body14 + c;
    if (isValidImei(candidate)) return candidate;
  }
  throw new Error('unreachable');
}

export function deviceStatus(
  lastSeenAt: Date | string | null | undefined,
  now: Date = new Date(),
  offlineAfterMinutes: number = DEFAULT_OFFLINE_AFTER_MINUTES,
): DeviceStatus {
  if (!lastSeenAt) return 'never';
  const seen = typeof lastSeenAt === 'string' ? new Date(lastSeenAt) : lastSeenAt;
  return now.getTime() - seen.getTime() <= offlineAfterMinutes * 60_000 ? 'online' : 'offline';
}
