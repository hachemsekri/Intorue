import { z } from 'zod';
import type { DeviceGateway, NormalizedPosition } from './device-gateway';

const KNOTS_TO_KMH = 1.852;

/**
 * Traccar "position forwarding" payload (forward.type=json):
 *   { "position": { latitude, longitude, speed (knots), course, fixTime, valid, attributes… },
 *     "device":   { uniqueId, name, … } }
 * Only the fields we use are validated; unknown fields are ignored.
 */
const traccarPosition = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(250).default(0), // knots (~460 km/h ceiling)
  course: z.number().min(0).max(360).optional(),
  altitude: z.number().optional(),
  accuracy: z.number().min(0).optional(),
  valid: z.boolean().default(true),
  fixTime: z.string().datetime({ offset: true }).optional(),
  deviceTime: z.string().datetime({ offset: true }).optional(),
  attributes: z.record(z.unknown()).default({}),
});
const traccarDevice = z.object({ uniqueId: z.string().min(1).max(32) });
const traccarForward = z.object({ position: traccarPosition, device: traccarDevice });
/** Traccar sends one object; our simulator may batch up to 100. */
const traccarPayload = z.union([traccarForward, z.array(traccarForward).min(1).max(100)]);
export type TraccarForward = z.input<typeof traccarForward>;

/** Attributes kept with each position (others are dropped to bound storage). */
const KEPT_ATTRS = ['motion', 'alarm', 'event', 'odometer', 'totalDistance', 'power', 'battery', 'rssi', 'sat'] as const;

export class TraccarGateway implements DeviceGateway {
  readonly name = 'traccar';

  normalize(payload: unknown): NormalizedPosition[] {
    const parsed = traccarPayload.parse(payload);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((f) => this.one(f));
  }

  private one({ position: p, device }: z.infer<typeof traccarForward>): NormalizedPosition {
    const a = p.attributes;
    const time = p.fixTime ?? p.deviceTime;
    if (!time) throw new z.ZodError([{ code: 'custom', path: ['position', 'fixTime'], message: 'position.time_missing' }]);
    const attrs: Record<string, unknown> = {};
    for (const k of KEPT_ATTRS) if (a[k] !== undefined && typeof a[k] !== 'object') attrs[k] = a[k];

    const battery = num(a.batteryLevel);
    return {
      imei: device.uniqueId.trim(),
      recordedAt: new Date(time),
      lat: p.latitude,
      lon: p.longitude,
      speedKmh: round1(p.speed * KNOTS_TO_KMH),
      heading: p.course === undefined ? null : Math.round(p.course) % 360,
      altitudeM: p.altitude ?? null,
      accuracyM: p.accuracy ?? null,
      satellites: num(a.sat) ?? null,
      ignition: typeof a.ignition === 'boolean' ? a.ignition : null,
      // Only a reported percentage counts; raw battery voltage is kept in attrs.
      batteryPct: battery === null ? null : Math.max(0, Math.min(100, Math.round(battery))),
      valid: p.valid,
      source: a.simulated === true ? 'simulator' : 'device',
      attrs,
    };
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
export { KNOTS_TO_KMH };
