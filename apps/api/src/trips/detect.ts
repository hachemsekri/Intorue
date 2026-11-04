/**
 * Trip and stop detection from raw GPS fixes. Pure and device-agnostic: it uses only time,
 * position and speed, never device-specific flags (ignition is unreliable across models).
 *
 * Rules (defaults in DEFAULT_TRIP_OPTIONS):
 *  - A fix is "moving" at movingKmh or more.
 *  - A trip starts at the first moving fix (from the last stopped fix before it, if recent).
 *  - A trip ends when the vehicle has not moved for minStopS (short stops such as traffic
 *    lights stay inside the trip), or when data stops for longer than maxGapS.
 *  - Trips that never get further than minTripDistanceM from their start are GPS drift and are dropped.
 *  - Fixes implying an impossible jump (> maxJumpKmh) are ignored as glitches.
 */
export interface Fix {
  at: Date;
  lat: number;
  lon: number;
  speedKmh: number;
}

export interface TripOptions {
  movingKmh: number;
  minStopS: number;
  maxGapS: number;
  minTripDistanceM: number;
  maxJumpKmh: number;
}

export const DEFAULT_TRIP_OPTIONS: TripOptions = {
  movingKmh: 5,
  minStopS: 300,
  maxGapS: 900,
  minTripDistanceM: 200,
  maxJumpKmh: 250,
};

export interface DetectedTrip {
  startedAt: Date;
  endedAt: Date;
  start: Fix;
  end: Fix;
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  ongoing: boolean;
  fixes: Fix[];
}

export interface DetectedStop {
  startedAt: Date;
  endedAt: Date;
  durationS: number;
  lat: number;
  lon: number;
}

const R = 6_371_000;
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Removes out-of-order duplicates and impossible jumps. */
export function cleanFixes(input: Fix[], maxJumpKmh = DEFAULT_TRIP_OPTIONS.maxJumpKmh): Fix[] {
  const sorted = [...input].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: Fix[] = [];
  for (const f of sorted) {
    const prev = out.at(-1);
    if (prev) {
      const dt = (f.at.getTime() - prev.at.getTime()) / 1000;
      if (dt <= 0) continue;
      const kmh = (distanceM(prev, f) / dt) * 3.6;
      if (kmh > maxJumpKmh && distanceM(prev, f) > 500) continue; // glitch
    }
    out.push(f);
  }
  return out;
}

export function detectTrips(
  input: Fix[],
  opts: Partial<TripOptions> = {},
  now: Date = new Date(),
): { trips: DetectedTrip[]; stops: DetectedStop[] } {
  const o = { ...DEFAULT_TRIP_OPTIONS, ...opts };
  const fixes = cleanFixes(input, o.maxJumpKmh);
  const segments: { fixes: Fix[]; ongoing?: boolean }[] = [];

  let current: Fix[] | null = null;
  let lastMovingIdx = -1; // index in `current`
  let lastStill: Fix | null = null;

  const close = (cut: number) => {
    if (current) segments.push({ fixes: current.slice(0, cut) });
    current = null;
    lastMovingIdx = -1;
  };

  for (const f of fixes) {
    const moving = f.speedKmh >= o.movingKmh;
    if (current) {
      const prev = current[current.length - 1]!;
      const gapS = (f.at.getTime() - prev.at.getTime()) / 1000;
      if (gapS > o.maxGapS) {
        // Data stopped: the trip ends at the last fix we have.
        close(current.length);
        lastStill = moving ? null : f;
        if (moving) {
          current = [f];
          lastMovingIdx = 0;
        }
        continue;
      }
      current.push(f);
      if (moving) {
        lastMovingIdx = current.length - 1;
      } else {
        const lastMoving = current[lastMovingIdx]!;
        if ((f.at.getTime() - lastMoving.at.getTime()) / 1000 >= o.minStopS) {
          // Stopped long enough: trip ended at the first still fix after the last movement.
          close(lastMovingIdx + 2);
          lastStill = f;
        }
      }
    } else if (moving) {
      const startFrom =
        lastStill && (f.at.getTime() - lastStill.at.getTime()) / 1000 <= o.maxGapS ? [lastStill, f] : [f];
      current = startFrom;
      lastMovingIdx = current.length - 1;
    } else {
      lastStill = f;
    }
  }
  const open = current as Fix[] | null;
  if (open) {
    const lastMoving = open[lastMovingIdx]!;
    const last = open[open.length - 1]!;
    const sinceMoveS = (now.getTime() - lastMoving.at.getTime()) / 1000;
    const sinceLastS = (now.getTime() - last.at.getTime()) / 1000;
    if (sinceMoveS >= o.minStopS) {
      // Not moving (or no data) for long enough: the trip is over.
      segments.push({ fixes: open.slice(0, lastMovingIdx + 2) });
    } else {
      segments.push({ fixes: open, ongoing: sinceLastS < o.maxGapS });
    }
  }

  const trips: DetectedTrip[] = [];
  for (const seg of segments) {
    const fs = seg.fixes;
    if (fs.length < 2) continue;
    let dist = 0;
    let max = 0;
    let reach = 0; // how far the vehicle got from where it started
    for (let i = 0; i < fs.length; i++) {
      if (i > 0) dist += distanceM(fs[i - 1]!, fs[i]!);
      max = Math.max(max, fs[i]!.speedKmh);
      reach = Math.max(reach, distanceM(fs[0]!, fs[i]!));
    }
    // Zig-zag GPS drift adds up to a long path without going anywhere.
    if (reach < o.minTripDistanceM) continue;
    const start = fs[0]!;
    const end = fs[fs.length - 1]!;
    const durationS = Math.max(1, Math.round((end.at.getTime() - start.at.getTime()) / 1000));
    trips.push({
      startedAt: start.at,
      endedAt: end.at,
      start,
      end,
      distanceM: Math.round(dist),
      durationS,
      maxSpeedKmh: Math.round(max),
      avgSpeedKmh: Math.round((dist / durationS) * 3.6),
      ongoing: !!seg.ongoing,
      fixes: fs,
    });
  }

  // Stops: the time between two consecutive trips, at the place the first one ended.
  const stops: DetectedStop[] = [];
  for (let i = 0; i + 1 < trips.length; i++) {
    const a = trips[i]!;
    const b = trips[i + 1]!;
    const durationS = Math.round((b.startedAt.getTime() - a.endedAt.getTime()) / 1000);
    if (durationS >= o.minStopS) {
      stops.push({ startedAt: a.endedAt, endedAt: b.startedAt, durationS, lat: a.end.lat, lon: a.end.lon });
    }
  }
  return { trips, stops };
}

/** Douglas–Peucker simplification for drawing routes ([lon, lat] output). */
export function simplify(fixes: Fix[], toleranceM = 8, maxPoints = 2000): [number, number][] {
  if (fixes.length <= 2) return fixes.map((f) => [f.lon, f.lat]);
  const keep = new Uint8Array(fixes.length);
  keep[0] = keep[fixes.length - 1] = 1;
  const stack: [number, number][] = [[0, fixes.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = crossTrackM(fixes[i]!, fixes[a]!, fixes[b]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  let out = fixes.filter((_, i) => keep[i]).map((f) => [f.lon, f.lat] as [number, number]);
  if (out.length > maxPoints) {
    const step = Math.ceil(out.length / maxPoints);
    out = out.filter((_, i) => i % step === 0 || i === out.length - 1);
  }
  return out;
}

/** Distance from p to segment a–b, using a local flat projection (fine at city scale). */
function crossTrackM(p: Fix, a: Fix, b: Fix): number {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110_540;
  const ax = 0, ay = 0;
  const bx = (b.lon - a.lon) * kx, by = (b.lat - a.lat) * ky;
  const px = (p.lon - a.lon) * kx, py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}
