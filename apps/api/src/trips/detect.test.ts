import { describe, expect, it } from 'vitest';
import { cleanFixes, detectTrips, distanceM, simplify, type Fix } from './detect';

const T0 = new Date('2026-11-04T07:00:00Z').getTime();
const at = (s: number) => new Date(T0 + s * 1000);

/** Builds fixes every `stepS` seconds, moving east at `kmh` (0 = parked) for `durationS`. */
function leg(startS: number, durationS: number, kmh: number, from: { lat: number; lon: number }, stepS = 10) {
  const out: Fix[] = [];
  let lon = from.lon;
  const mPerDegLon = 111_320 * Math.cos((from.lat * Math.PI) / 180);
  for (let s = 0; s <= durationS; s += stepS) {
    out.push({ at: at(startS + s), lat: from.lat, lon, speedKmh: kmh });
    lon += ((kmh / 3.6) * stepS) / mPerDegLon;
  }
  return out;
}
const TUNIS = { lat: 36.8, lon: 10.18 };
const end = (fs: Fix[]) => fs[fs.length - 1]!;
const LATE = at(100_000); // "now", long after the data

describe('trip detection', () => {
  it('finds one trip between two long stops', () => {
    const parked1 = leg(0, 600, 0, TUNIS);
    const drive = leg(610, 900, 50, end(parked1));
    const parked2 = leg(1520, 900, 0, end(drive));
    const { trips, stops } = detectTrips([...parked1, ...drive, ...parked2], {}, LATE);
    expect(trips).toHaveLength(1);
    const t = trips[0]!;
    expect(t.maxSpeedKmh).toBe(50);
    // 900 s at 50 km/h ≈ 12.5 km
    expect(t.distanceM).toBeGreaterThan(12_000);
    expect(t.distanceM).toBeLessThan(13_200);
    expect(t.durationS).toBeGreaterThanOrEqual(900);
    expect(t.ongoing).toBe(false);
    expect(stops).toHaveLength(0);
  });

  it('keeps short stops (traffic lights) inside the trip and splits on long stops', () => {
    const a = leg(0, 300, 40, TUNIS);
    const light = leg(310, 90, 0, end(a)); // 1.5 min
    const b = leg(410, 300, 40, end(light));
    const delivery = leg(720, 600, 0, end(b)); // 10 min
    const c = leg(1330, 300, 40, end(delivery));
    const { trips, stops } = detectTrips([...a, ...light, ...b, ...delivery, ...c], {}, LATE);
    expect(trips).toHaveLength(2);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.durationS).toBeGreaterThanOrEqual(540);
  });

  it('ignores GPS drift while parked', () => {
    const drift: Fix[] = [];
    for (let s = 0; s < 3600; s += 30) {
      drift.push({ at: at(s), lat: TUNIS.lat + (Math.random() - 0.5) * 0.0002, lon: TUNIS.lon + (Math.random() - 0.5) * 0.0002, speedKmh: s % 300 === 0 ? 6 : 0 });
    }
    expect(detectTrips(drift, {}, LATE).trips).toHaveLength(0);
  });

  it('ends a trip when data stops for too long (device offline)', () => {
    const a = leg(0, 600, 60, TUNIS);
    const b = leg(600 + 1800, 600, 60, { lat: 36.9, lon: 10.3 });
    const { trips } = detectTrips([...a, ...b], {}, LATE);
    expect(trips).toHaveLength(2);
    expect(trips[0]!.endedAt.getTime()).toBe(end(a).at.getTime());
  });

  it('drops impossible jumps', () => {
    const a = leg(0, 300, 40, TUNIS);
    const glitch: Fix = { at: at(305), lat: 40.0, lon: 2.0, speedKmh: 40 }; // Spain, 5 s later
    const b = leg(310, 300, 40, end(a));
    const cleaned = cleanFixes([...a, glitch, ...b]);
    expect(cleaned.some((f) => f.lat === 40)).toBe(false);
    const { trips } = detectTrips([...a, glitch, ...b], {}, LATE);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.distanceM).toBeLessThan(10_000);
  });

  it('marks the last trip ongoing while the vehicle is still driving', () => {
    const a = leg(0, 600, 50, TUNIS);
    const now = at(605);
    const { trips } = detectTrips(a, {}, now);
    expect(trips).toHaveLength(1);
    expect(trips[0]!.ongoing).toBe(true);
  });

  it('ends the last trip once the vehicle has been still long enough', () => {
    const a = leg(0, 600, 50, TUNIS);
    const parked = leg(610, 400, 0, end(a));
    const { trips } = detectTrips([...a, ...parked], {}, at(1100));
    expect(trips[0]!.ongoing).toBe(false);
  });

  it('accepts fixes out of order and with duplicates', () => {
    const a = leg(0, 600, 50, TUNIS);
    const shuffled = [...a].reverse().concat(a.slice(0, 5));
    expect(detectTrips(shuffled, {}, LATE).trips).toHaveLength(1);
  });

  it('simplifies a straight route to its ends', () => {
    const a = leg(0, 600, 50, TUNIS);
    expect(simplify(a)).toHaveLength(2);
    expect(distanceM({ lat: 36.8065, lon: 10.1815 }, { lat: 36.4, lon: 10.6084 })).toBeGreaterThan(58_000);
  });
});

describe('speedProfile', () => {
  it('keeps every point for short trips and the peaks for long ones', async () => {
    const { speedProfile } = await import('./detect');
    const t0 = new Date('2026-11-04T08:00:00Z').getTime();
    const mk = (i: number, kmh: number) => ({ at: new Date(t0 + i * 10_000), lat: 36.8, lon: 10.18, speedKmh: kmh });
    expect(speedProfile([mk(0, 0), mk(1, 30.4), mk(2, 50)])).toEqual([[0, 0], [10, 30], [20, 50]]);
    const long = Array.from({ length: 1000 }, (_, i) => mk(i, i === 517 ? 131 : 40));
    const p = speedProfile(long, 100);
    expect(p.length).toBeLessThanOrEqual(101);
    expect(Math.max(...p.map((x) => x[1]))).toBe(131);
    expect(p[p.length - 1]![0]).toBe(9990);
  });
});
