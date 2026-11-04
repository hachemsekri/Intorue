import { describe, expect, it } from 'vitest';
import { can, deviceStatus, formatPlate, imeiWithCheckDigit, isValidImei, parsePlate } from './index';

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
  });
});
