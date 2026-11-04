/**
 * Alert rule evaluation. Pure functions: (rule params, remembered state, new facts) →
 * (new state, maybe one alert). The engine stores the state per rule and vehicle.
 *
 * Each rule alerts once per "episode" and re-arms only when the condition has clearly
 * ended, so a vehicle hovering around a threshold does not flood the inbox.
 */
import type { AlertParams, ScheduleWindow } from '@winou/shared';
import { DEFAULT_TIMEZONE } from '@winou/shared';

export type State = Record<string, unknown>;
export interface Fire {
  details: Record<string, unknown>;
}
export interface Result {
  state: State;
  fire?: Fire;
}

export interface PositionFacts {
  at: Date;
  speedKmh: number;
  batteryPct: number | null;
  /** IDs of the organization's zones that contain this fix. */
  insideZones: ReadonlySet<string>;
  vehicleSpeedLimitKmh: number | null;
}

const DEFAULT_SPEED_LIMIT = 110;
/** Speed must drop this far under the limit before a new speeding alert can fire. */
const SPEED_HYSTERESIS_KMH = 5;
/** Battery must recover this far above the threshold before a new alert can fire. */
const BATTERY_HYSTERESIS_PCT = 5;
/** Out-of-hours movement re-arms after the vehicle has been still this long. */
const SCHEDULE_REARM_S = 600;

export function speeding(p: AlertParams['speeding'], s: State, f: PositionFacts): Result {
  const limit = p.limitKmh ?? f.vehicleSpeedLimitKmh ?? DEFAULT_SPEED_LIMIT;
  const t = f.at.getTime();
  if (f.speedKmh > limit) {
    const overSince = typeof s.overSince === 'number' ? s.overSince : t;
    const maxKmh = Math.max(Number(s.maxKmh ?? 0), f.speedKmh);
    const next: State = { overSince, maxKmh, fired: s.fired === true };
    if (!next.fired && (t - overSince) / 1000 >= p.minDurationS) {
      next.fired = true;
      return { state: next, fire: { details: { speedKmh: Math.round(maxKmh), limitKmh: limit } } };
    }
    return { state: next };
  }
  if (f.speedKmh <= limit - SPEED_HYSTERESIS_KMH) return { state: {} };
  // Between limit - 5 and limit: keep the episode as it is.
  return { state: { ...s, overSince: s.fired ? s.overSince : undefined } };
}

export function zoneTransition(kind: 'exit' | 'enter', zoneId: string, s: State, f: PositionFacts, zoneName: string): Result {
  const inside = f.insideZones.has(zoneId);
  const was = s.inside;
  const state = { inside };
  if (typeof was !== 'boolean') return { state }; // first fix: learn, don't alert
  if (kind === 'exit' && was && !inside) return { state, fire: { details: { geofenceId: zoneId, geofenceName: zoneName } } };
  if (kind === 'enter' && !was && inside) return { state, fire: { details: { geofenceId: zoneId, geofenceName: zoneName } } };
  return { state };
}

export function lowBattery(p: AlertParams['low_battery'], s: State, f: PositionFacts): Result {
  if (f.batteryPct === null) return { state: s };
  if (f.batteryPct < p.thresholdPct) {
    if (s.fired) return { state: s };
    return { state: { fired: true }, fire: { details: { batteryPct: f.batteryPct, thresholdPct: p.thresholdPct } } };
  }
  if (f.batteryPct >= p.thresholdPct + BATTERY_HYSTERESIS_PCT) return { state: {} };
  return { state: s };
}

export function movementSchedule(p: AlertParams['movement_schedule'], s: State, f: PositionFacts, tz = DEFAULT_TIMEZONE): Result {
  const t = f.at.getTime();
  const moving = f.speedKmh >= p.minSpeedKmh;
  const allowed = isWithinWindows(p.windows, f.at, tz);
  if (allowed) return { state: {} };
  if (!moving) {
    const lastMove = typeof s.lastMoveAt === 'number' ? s.lastMoveAt : null;
    if (s.fired && lastMove !== null && (t - lastMove) / 1000 >= SCHEDULE_REARM_S) return { state: {} };
    return { state: s };
  }
  if (s.fired) return { state: { ...s, lastMoveAt: t } };
  const local = localParts(f.at, tz);
  return {
    state: { fired: true, lastMoveAt: t },
    fire: { details: { localTime: `${pad(local.hour)}:${pad(local.minute)}`, speedKmh: Math.round(f.speedKmh) } },
  };
}

/** Evaluated by the periodic job from the device's last report time. */
export function deviceOffline(p: AlertParams['device_offline'], s: State, lastSeenAt: Date | null, now: Date): Result {
  if (!lastSeenAt) return { state: s }; // never connected: not "went offline"
  const silentMin = (now.getTime() - lastSeenAt.getTime()) / 60_000;
  if (silentMin < p.afterMinutes) return { state: {} };
  if (s.fired) return { state: s };
  return {
    state: { fired: true },
    fire: { details: { lastSeenAt: lastSeenAt.toISOString(), afterMinutes: p.afterMinutes } },
  };
}

// ---------- Time windows in the organization's time zone ----------

interface LocalParts {
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function localParts(d: Date, tz: string): LocalParts {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: WEEKDAYS[parts.weekday!]!, hour: Number(parts.hour), minute: Number(parts.minute) };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * True if `d` falls in one of the windows. A window that crosses midnight (22:00→06:00)
 * belongs to the day it starts on: "Friday 22:00→06:00" covers Saturday 03:00.
 */
export function isWithinWindows(windows: ScheduleWindow[], d: Date, tz = DEFAULT_TIMEZONE): boolean {
  const { weekday, hour, minute } = localParts(d, tz);
  const m = hour * 60 + minute;
  const yesterday = weekday === 1 ? 7 : weekday - 1;
  return windows.some((w) => {
    const s = toMin(w.start);
    const e = toMin(w.end);
    if (s < e) return w.days.includes(weekday) && m >= s && m < e;
    return (w.days.includes(weekday) && m >= s) || (w.days.includes(yesterday) && m < e);
  });
}
