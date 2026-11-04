import { describe, expect, it } from 'vitest';
import { deviceOffline, isWithinWindows, localParts, lowBattery, movementSchedule, speeding, zoneTransition, type PositionFacts, type State } from './evaluate';

const base = new Date('2026-11-04T09:00:00Z').getTime(); // Wednesday 10:00 in Tunis (UTC+1)
const facts = (o: Partial<PositionFacts> & { s?: number }): PositionFacts => ({
  at: new Date(base + (o.s ?? 0) * 1000),
  speedKmh: o.speedKmh ?? 0,
  batteryPct: o.batteryPct ?? null,
  insideZones: o.insideZones ?? new Set(),
  vehicleSpeedLimitKmh: o.vehicleSpeedLimitKmh ?? null,
});

/** Feeds a sequence of facts through an evaluator, returning the alerts fired. */
function run(fn: (s: State, f: PositionFacts) => { state: State; fire?: { details: Record<string, unknown> } }, seq: PositionFacts[]) {
  let s: State = {};
  const fired: Record<string, unknown>[] = [];
  for (const f of seq) {
    const r = fn(s, f);
    s = r.state;
    if (r.fire) fired.push(r.fire.details);
  }
  return fired;
}

describe('speeding', () => {
  const p = { limitKmh: 90, minDurationS: 15 };
  it('alerts once after staying over the limit long enough', () => {
    const seq = [0, 5, 10, 15, 20, 25].map((s) => facts({ s, speedKmh: 100 + s }));
    expect(run((s, f) => speeding(p, s, f), seq)).toEqual([{ speedKmh: 115, limitKmh: 90 }]);
  });
  it('ignores a short spike', () => {
    const seq = [facts({ s: 0, speedKmh: 120 }), facts({ s: 5, speedKmh: 60 }), facts({ s: 10, speedKmh: 120 }), facts({ s: 15, speedKmh: 60 })];
    expect(run((s, f) => speeding(p, s, f), seq)).toEqual([]);
  });
  it('re-arms only after slowing clearly under the limit', () => {
    const over = (s: number) => facts({ s, speedKmh: 100 });
    const seq = [over(0), over(20), facts({ s: 30, speedKmh: 88 }), over(40), over(60), facts({ s: 70, speedKmh: 80 }), over(80), over(100)];
    expect(run((s, f) => speeding(p, s, f), seq)).toHaveLength(2);
  });
  it('uses the vehicle’s own limit, then 110 km/h', () => {
    const auto = { limitKmh: null, minDurationS: 0 };
    expect(run((s, f) => speeding(auto, s, f), [facts({ speedKmh: 60, vehicleSpeedLimitKmh: 50 })])).toEqual([{ speedKmh: 60, limitKmh: 50 }]);
    expect(run((s, f) => speeding(auto, s, f), [facts({ speedKmh: 105 })])).toEqual([]);
    expect(run((s, f) => speeding(auto, s, f), [facts({ speedKmh: 115 })])).toEqual([{ speedKmh: 115, limitKmh: 110 }]);
  });
});

describe('zones', () => {
  const Z = 'zone-1';
  const inside = (s: number) => facts({ s, insideZones: new Set([Z]) });
  const outside = (s: number) => facts({ s });
  it('alerts on leaving, not on the first fix', () => {
    const fired = run((s, f) => zoneTransition('exit', Z, s, f, 'Grand Tunis'), [outside(0), inside(10), inside(20), outside(30), outside(40)]);
    expect(fired).toEqual([{ geofenceId: Z, geofenceName: 'Grand Tunis' }]);
  });
  it('alerts on entering', () => {
    expect(run((s, f) => zoneTransition('enter', Z, s, f, 'Port'), [outside(0), inside(10), outside(20), inside(30)])).toHaveLength(2);
    expect(run((s, f) => zoneTransition('enter', Z, s, f, 'Port'), [inside(0), inside(10)])).toHaveLength(0);
  });
});

describe('low battery', () => {
  const p = { thresholdPct: 20 };
  it('alerts once below the threshold and re-arms after recovering by 5 points', () => {
    const b = (s: number, pct: number | null) => facts({ s, batteryPct: pct });
    const seq = [b(0, 30), b(1, 19), b(2, 15), b(3, null), b(4, 22), b(5, 18), b(6, 60), b(7, 10)];
    expect(run((s, f) => lowBattery(p, s, f), seq)).toEqual([
      { batteryPct: 19, thresholdPct: 20 },
      { batteryPct: 10, thresholdPct: 20 },
    ]);
  });
});

describe('movement outside allowed hours (Africa/Tunis)', () => {
  const weekdaysDay = { windows: [{ days: [1, 2, 3, 4, 5], start: '07:00', end: '19:00' }], minSpeedKmh: 5 };
  const tunis = (iso: string) => new Date(iso); // ISO with +01:00
  it('reads local time in Tunis (UTC+1, no daylight saving)', () => {
    expect(localParts(tunis('2026-11-04T06:59:00+01:00'), 'Africa/Tunis')).toEqual({ weekday: 3, hour: 6, minute: 59 });
    expect(localParts(tunis('2026-07-15T23:30:00Z'), 'Africa/Tunis')).toEqual({ weekday: 4, hour: 0, minute: 30 });
  });
  it('respects window boundaries', () => {
    const w = weekdaysDay.windows;
    expect(isWithinWindows(w, tunis('2026-11-04T07:00:00+01:00'))).toBe(true);
    expect(isWithinWindows(w, tunis('2026-11-04T18:59:00+01:00'))).toBe(true);
    expect(isWithinWindows(w, tunis('2026-11-04T19:00:00+01:00'))).toBe(false);
    expect(isWithinWindows(w, tunis('2026-11-07T10:00:00+01:00'))).toBe(false); // Saturday
  });
  it('handles windows crossing midnight, attributed to their start day', () => {
    const night = [{ days: [5], start: '22:00', end: '06:00' }]; // Friday night
    expect(isWithinWindows(night, tunis('2026-11-06T23:00:00+01:00'))).toBe(true); // Fri 23:00
    expect(isWithinWindows(night, tunis('2026-11-07T03:00:00+01:00'))).toBe(true); // Sat 03:00
    expect(isWithinWindows(night, tunis('2026-11-07T23:00:00+01:00'))).toBe(false); // Sat 23:00
    expect(isWithinWindows(night, tunis('2026-11-06T03:00:00+01:00'))).toBe(false); // Fri 03:00 (Thu night)
  });
  it('alerts once per out-of-hours outing and re-arms after 10 minutes still', () => {
    const f = (iso: string, speedKmh: number): PositionFacts => ({ ...facts({}), at: tunis(iso), speedKmh });
    const seq = [
      f('2026-11-04T22:00:00+01:00', 30),
      f('2026-11-04T22:05:00+01:00', 40),
      f('2026-11-04T22:20:00+01:00', 0),
      f('2026-11-04T22:40:00+01:00', 0),
      f('2026-11-04T23:00:00+01:00', 25),
      f('2026-11-05T08:00:00+01:00', 50), // allowed
    ];
    expect(run((s, x) => movementSchedule(weekdaysDay, s, x), seq)).toEqual([
      { localTime: '22:00', speedKmh: 30 },
      { localTime: '23:00', speedKmh: 25 },
    ]);
  });
  it('treats an empty schedule as "never allowed"', () => {
    expect(run((s, x) => movementSchedule({ windows: [], minSpeedKmh: 5 }, s, x), [facts({ speedKmh: 20 })])).toHaveLength(1);
  });
});

describe('device offline', () => {
  const p = { afterMinutes: 15 };
  it('alerts once after the delay and re-arms when the device reports again', () => {
    const now = new Date(base);
    const ago = (min: number) => new Date(base - min * 60_000);
    let s: State = {};
    let r = deviceOffline(p, s, ago(10), now);
    expect(r.fire).toBeUndefined();
    r = deviceOffline(p, r.state, ago(16), now);
    expect(r.fire?.details).toMatchObject({ afterMinutes: 15 });
    r = deviceOffline(p, r.state, ago(30), now);
    expect(r.fire).toBeUndefined();
    r = deviceOffline(p, r.state, ago(1), now); // back online
    expect(r.state).toEqual({});
    s = r.state;
    expect(deviceOffline(p, s, ago(20), now).fire).toBeDefined();
    expect(deviceOffline(p, {}, null, now).fire).toBeUndefined(); // never connected
  });
});
