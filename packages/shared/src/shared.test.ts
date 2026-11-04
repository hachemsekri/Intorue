import { describe, expect, it } from 'vitest';
import { can, createDeviceSchema, deviceStatus, formatPlate, imeiWithCheckDigit, isValidDeviceId, isValidImei, parsePlate } from './index';

describe('plates', () => {
  it.each([
    ['245 TUN 7812', '245 TUN 7812'],
    ['245tun7812', '245 TUN 7812'],
    ['245-TU-7812', '245 TUN 7812'],
    ['245 تونس 7812', '245 TUN 7812'],
    ['007 TUN 0042', '7 TUN 42'],
  ])('parses standard %s', (input, normalized) => {
    expect(parsePlate(input)).toEqual({ format: 'tn_standard', normalized });
  });

  it('ignores invisible direction marks copied with Arabic text', () => {
    const lrm = String.fromCharCode(0x200e);
    expect(parsePlate(`${lrm}245 TUN 7812${lrm}`)?.normalized).toBe('245 TUN 7812');
  });

  it('parses RS plates', () => {
    expect(parsePlate('123456 RS')).toEqual({ format: 'tn_rs', normalized: '123456 RS' });
  });

  it('rejects malformed plates when a format is forced', () => {
    expect(parsePlate('ABC', 'tn_standard')).toBeNull();
    expect(parsePlate('1234 TUN 12345', 'tn_standard')).toBeNull();
  });

  it('falls back to other', () => {
    expect(parsePlate('cd 12-34')).toEqual({ format: 'other', normalized: 'CD 12-34' });
    expect(parsePlate('TR-014')).toEqual({ format: 'other', normalized: 'TR-014' });
  });

  it('formats for Arabic', () => {
    expect(formatPlate('245 TUN 7812', 'tn_standard', 'ar')).toBe('245 تونس 7812');
    expect(formatPlate('245 TUN 7812', 'tn_standard', 'fr')).toBe('245 TUN 7812');
  });
});

describe('imei', () => {
  it('validates Luhn', () => {
    expect(isValidImei('490154203237518')).toBe(true);
    expect(isValidImei('490154203237519')).toBe(false);
    expect(isValidImei('12345')).toBe(false);
  });
  it('accepts device IDs of 8–20 digits, without requiring the check digit', () => {
    expect(isValidDeviceId('490154203237519')).toBe(true); // bad check digit, still accepted
    expect(isValidDeviceId('4209951530')).toBe(true); // 10-digit tracker ID
    expect(isValidDeviceId('1234567')).toBe(false);
    expect(isValidDeviceId('123456789012345678901')).toBe(false);
    expect(createDeviceSchema.parse({ imei: ' 86 123-456 789 0123 ' }).imei).toBe('861234567890123');
    expect(createDeviceSchema.safeParse({ imei: '86123456789O123' }).success).toBe(false); // letter O
  });
  it('generates check digits', () => {
    expect(isValidImei(imeiWithCheckDigit('35000000000001'))).toBe(true);
  });
});

describe('device status', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  it('derives status from last report', () => {
    expect(deviceStatus(null, now)).toBe('never');
    expect(deviceStatus(new Date('2026-11-04T11:55:00Z'), now)).toBe('online');
    expect(deviceStatus(new Date('2026-11-04T11:49:00Z'), now)).toBe('offline');
  });
});

describe('permissions', () => {
  it('matches the role matrix', () => {
    expect(can('owner', 'members.manage')).toBe(true);
    expect(can('manager', 'members.manage')).toBe(false);
    expect(can('manager', 'devices.write')).toBe(true);
    expect(can('viewer', 'vehicles.write')).toBe(false);
    expect(can('viewer', 'vehicles.read')).toBe(true);
    expect(can('viewer', 'audit.read')).toBe(false);
    expect(can('viewer', 'alerts.read')).toBe(true);
    expect(can('viewer', 'alerts.handle')).toBe(false);
    expect(can('viewer', 'alerts.configure')).toBe(false);
    expect(can('manager', 'alerts.handle')).toBe(true);
    expect(can('manager', 'alerts.configure')).toBe(true);
  });
});

describe('live status', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const device = (lastSeenAt: string | null) => ({ id: 'd', imei: '1', lastSeenAt, batteryPct: null });
  const position = (speedKmh: number) => ({
    lat: 36.8, lon: 10.18, speedKmh, heading: null, recordedAt: '2026-11-04T11:59:00Z', ignition: null, movingSince: null, stoppedSince: null, source: 'device' as const,
  });
  it('derives moving, stopped, offline, never and no_device', async () => {
    const { liveStatus } = await import('./live');
    expect(liveStatus({ device: null, position: null }, now)).toBe('no_device');
    expect(liveStatus({ device: device(null), position: null }, now)).toBe('never');
    expect(liveStatus({ device: device('2026-11-04T11:59:30Z'), position: position(42) }, now)).toBe('moving');
    expect(liveStatus({ device: device('2026-11-04T11:59:30Z'), position: position(1) }, now)).toBe('stopped');
    expect(liveStatus({ device: device('2026-11-04T11:40:00Z'), position: position(42) }, now)).toBe('offline');
  });
});
