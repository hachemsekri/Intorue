import { describe, expect, it } from 'vitest';
import { isValidImei } from '@winou/shared';
import { SimVehicle } from './engine';
import { distanceM } from './geo';
import { SCENARIOS } from './scenarios';
import { toTraccarForward } from './index';

const byLabel = (s: string) => SCENARIOS.find((x) => x.label.includes(s))!;
const t0 = new Date('2026-11-04T08:00:00Z');

function run(label: string, seconds: number, dt = 5) {
  const v = new SimVehicle(byLabel(label), 42);
  const out = [];
  for (let s = 0; s <= seconds; s += dt) out.push(v.step(s === 0 ? 0 : dt, new Date(t0.getTime() + s * 1000)));
  return out;
}

describe('simulator scenarios', () => {
  it('uses valid, demo-range IMEIs matching the seed', () => {
    for (const s of SCENARIOS) {
      expect(isValidImei(s.imei)).toBe(true);
      expect(s.imei.startsWith('350000000000')).toBe(true);
    }
  });

  it('stays around Tunis and moves at plausible speeds', () => {
    const fixes = run('Clio', 1800).filter((f) => f !== null);
    expect(fixes.length).toBeGreaterThan(300);
    for (const f of fixes) {
      expect(f!.lat).toBeGreaterThan(36.3);
      expect(f!.lat).toBeLessThan(37.0);
      expect(f!.speedKmh).toBeLessThan(100);
    }
    // Consecutive fixes 5 s apart never jump more than ~150 m.
    for (let i = 1; i < fixes.length; i++) {
      expect(distanceM([fixes[i - 1]!.lat, fixes[i - 1]!.lon], [fixes[i]!.lat, fixes[i]!.lon])).toBeLessThan(150);
    }
  });

  it('produces speeding on the motorway', () => {
    const max = Math.max(...run('i20', 3600).map((f) => f?.speedKmh ?? 0));
    expect(max).toBeGreaterThan(115);
  });

  it('includes stops for the delivery van', () => {
    const fixes = run('Logan', 1800);
    expect(fixes.filter((f) => f && f.speedKmh === 0).length).toBeGreaterThan(20);
  });

  it('goes silent during disconnections, then resumes', () => {
    const fixes = run('Yamaha', 1500);
    const silentAt = fixes.findIndex((f) => f === null);
    expect(silentAt).toBeGreaterThan(0);
    expect(fixes.slice(silentAt).some((f) => f !== null)).toBe(true);
  });

  it('reports a draining scooter battery', () => {
    const fixes = run('Trottinette', 1200).filter((f) => f !== null);
    expect(fixes[0]!.batteryPct).toBe(24);
    expect(Math.min(...fixes.map((f) => f!.batteryPct!))).toBeLessThan(20);
  });

  it('reports rarely while parked', () => {
    const fixes = run('Picanto', 600).filter((f) => f !== null);
    expect(fixes.length).toBeLessThanOrEqual(11);
    expect(fixes.every((f) => f!.speedKmh === 0)).toBe(true);
  });

  it('emits Traccar forwarding JSON with knots and the simulator flag', () => {
    const f = { imei: SCENARIOS[0]!.imei, at: t0, lat: 36.8, lon: 10.18, speedKmh: 50, heading: 90, batteryPct: 40, ignition: true };
    const j = toTraccarForward(f);
    expect(j.device.uniqueId).toBe(f.imei);
    expect(j.position.speed).toBeCloseTo(27, 0);
    expect(j.position.attributes).toMatchObject({ simulated: true, batteryLevel: 40 });
  });
});
