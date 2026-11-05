/**
 * The home page's example trips. They follow real roads (computed from our own map data by
 * scripts/build-home-routes.mjs) but the trips are SIMULATED.
 *
 * The small text part (streets, times, events) ships with the page; the route lines are fetched
 * only when a map first needs them.
 */
import meta from './routes-meta.json';

export type TripKey = 'car' | 'moto' | 'trot';
export type PlaceKey = keyof typeof meta.places;
export type AlertType = 'speeding' | 'movement_schedule' | 'geofence_exit' | 'low_battery' | 'device_offline';
export type EventKind = 'departFrom' | 'street' | 'speeding' | 'night' | 'zoneExit' | 'stopAt' | 'batteryLow';

export interface TripLeg {
  fr: string;
  ar: string;
  m: number;
  v: number;
  t: string;
  event: { kind: EventKind; place?: PlaceKey; street?: boolean };
  alert?: AlertType;
}
export interface Trip {
  metres: number;
  legs: TripLeg[];
  /** cumulative fraction of the trip at the end of each leg */
  stops: number[];
}

export const PLACES = meta.places as Record<PlaceKey, { fr: string; ar: string }>;
export const TRIPS = Object.fromEntries(
  Object.entries(meta.routes).map(([k, r]) => {
    const legs = r.legs as TripLeg[];
    const sum = legs.reduce((a, l) => a + l.m, 0);
    let acc = 0;
    return [k, { metres: r.metres, legs, stops: legs.map((l) => (acc += l.m) / sum) }];
  }),
) as Record<TripKey, Trip>;

export const legAt = (trip: Trip, p: number) => {
  const i = trip.stops.findIndex((x) => p <= x);
  return i < 0 ? trip.legs.length - 1 : i;
};

// ---------- route lines ----------

export type LngLat = [number, number];
export interface Line {
  line: LngLat[];
  cum: number[];
  total: number;
}

const dist = (a: LngLat, b: LngLat) => {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) * k) / 2);
  const y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371000;
};

function prep(line: LngLat[]): Line {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + dist(line[i - 1]!, line[i]!));
  return { line, cum, total: cum[cum.length - 1]! };
}

let loading: Promise<Record<TripKey, Line>> | null = null;
/** Fetches the route lines once (only when a map needs them). */
export function loadRoutes(): Promise<Record<TripKey, Line>> {
  loading ??= fetch('/home/routes.json')
    .then((r) => {
      if (!r.ok) throw new Error(`routes ${r.status}`);
      return r.json() as Promise<{ routes: Record<TripKey, LngLat[]> }>;
    })
    .then((j) => Object.fromEntries(Object.entries(j.routes).map(([k, l]) => [k, prep(l)])) as Record<TripKey, Line>)
    .catch((e) => {
      loading = null; // let a later visit try again
      throw e;
    });
  return loading;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Point at fraction p of the line, and the index of the segment it is on. */
export function pointAt(g: Line, p: number): { pt: LngLat; i: number } {
  const d = clamp(p, 0, 1) * g.total;
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i]! < d) i++;
  const seg = g.cum[i]! - g.cum[i - 1]! || 1;
  const f = (d - g.cum[i - 1]!) / seg;
  const a = g.line[i - 1]!;
  const b = g.line[i]!;
  return { pt: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], i };
}

/** Direction of travel, measured across ~70 m of road so small kinks don't make the vehicle twitch. */
export function headingAt(g: Line, p: number) {
  const d = 35 / Math.max(1, g.total);
  const a = pointAt(g, p - d).pt;
  const b = pointAt(g, p + d).pt;
  return (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
}

/** The part of the route already driven, as GeoJSON. */
export function drivenPart(g: Line, p: number) {
  const o = pointAt(g, p);
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: [...g.line.slice(0, o.i), o.pt] },
  };
}

/** Turns `from` towards `to` by fraction k, the short way round. */
export const turn = (from: number | null, to: number, k: number) => (from === null ? to : from + ((((to - from + 540) % 360) - 180) * k));
export const angleGap = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);
