import { z } from 'zod';
import type { VehicleType } from './enums';

export const ALERT_TYPES = ['speeding', 'geofence_exit', 'geofence_enter', 'movement_schedule', 'device_offline', 'low_battery'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['urgent', 'warning'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ['open', 'handled'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time.invalid');
const uuid = z.string().uuid();

/** One allowed time window. Days: 1 = Monday … 7 = Sunday. A window may cross midnight (22:00 → 06:00). */
export const scheduleWindowSchema = z
  .object({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7), start: hhmm, end: hhmm })
  .strict()
  .refine((w) => w.start !== w.end, { message: 'window.empty' });
export type ScheduleWindow = z.infer<typeof scheduleWindowSchema>;

/** Parameters per rule type. Validated on every create/update. */
export const alertParamsSchemas = {
  speeding: z
    .object({
      /** Null: use each vehicle's own speed limit, or 110 km/h if it has none. */
      limitKmh: z.number().int().min(20).max(250).nullable().default(null),
      /** Must stay above the limit this long before alerting (filters GPS spikes). */
      minDurationS: z.number().int().min(0).max(600).default(15),
    })
    .strict(),
  geofence_exit: z.object({ geofenceId: uuid }).strict(),
  geofence_enter: z.object({ geofenceId: uuid }).strict(),
  movement_schedule: z
    .object({
      /** Movement is allowed inside these windows; movement outside them alerts. */
      windows: z.array(scheduleWindowSchema).max(14),
      minSpeedKmh: z.number().min(3).max(50).default(5),
    })
    .strict(),
  device_offline: z.object({ afterMinutes: z.number().int().min(5).max(1440).default(15) }).strict(),
  low_battery: z.object({ thresholdPct: z.number().int().min(5).max(50).default(20) }).strict(),
} satisfies Record<AlertType, z.ZodTypeAny>;

export type AlertParams = { [K in AlertType]: z.infer<(typeof alertParamsSchemas)[K]> };

const ruleBase = {
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  severity: z.enum(ALERT_SEVERITIES).default('warning'),
  /** Null = all vehicles of the organization. */
  vehicleIds: z.array(uuid).max(500).nullable().default(null),
};

export const createAlertRuleSchema = z.discriminatedUnion(
  'type',
  ALERT_TYPES.map((type) => z.object({ type: z.literal(type), params: alertParamsSchemas[type], ...ruleBase }).strict()) as unknown as [
    z.ZodDiscriminatedUnionOption<'type'>,
    ...z.ZodDiscriminatedUnionOption<'type'>[],
  ],
);
export type CreateAlertRuleInput = { [K in AlertType]: { type: K; params: AlertParams[K]; name: string; enabled: boolean; severity: AlertSeverity; vehicleIds: string[] | null } }[AlertType];

export const updateAlertRuleSchema = z
  .object({
    name: ruleBase.name.optional(),
    enabled: z.boolean().optional(),
    severity: z.enum(ALERT_SEVERITIES).optional(),
    vehicleIds: z.array(uuid).max(500).nullable().optional(),
    /** Validated against the rule's type by the API. */
    params: z.record(z.unknown()).optional(),
  })
  .strict();

export const handleAlertSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();
export const listAlertsQuery = z
  .object({
    status: z.enum(ALERT_STATUSES).default('open'),
    vehicleId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    before: z.string().datetime().optional(),
  })
  .strict();

// ---------- Zones (geofences) ----------
const lon = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
export const geofenceShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('circle'), center: z.tuple([lon, lat]), radiusM: z.number().int().min(50).max(100_000) }).strict(),
  z
    .object({ kind: z.literal('polygon'), points: z.array(z.tuple([lon, lat])).min(3).max(200) })
    .strict(),
]);
export const createGeofenceSchema = z
  .object({ name: z.string().trim().min(1).max(80), shape: geofenceShapeSchema })
  .strict();
export const updateGeofenceSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional(), shape: geofenceShapeSchema.optional() })
  .strict();
export type GeofenceShape = z.infer<typeof geofenceShapeSchema>;

// ---------- DTOs ----------
export interface GeofenceDto {
  id: string;
  name: string;
  shape: GeofenceShape;
  /** Outline as [lon, lat] ring, for drawing (circles are approximated). */
  ring: [number, number][];
  createdAt: string;
}

export interface AlertRuleDto {
  id: string;
  type: AlertType;
  name: string;
  enabled: boolean;
  severity: AlertSeverity;
  vehicleIds: string[] | null;
  params: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AlertDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  occurredAt: string;
  ruleId: string | null;
  ruleName: string | null;
  vehicle: { id: string; name: string; plate: string; type: VehicleType };
  position: { lat: number; lon: number } | null;
  /** Type-specific facts, e.g. { speedKmh, limitKmh } or { geofenceName }. */
  details: Record<string, unknown>;
  handledAt: string | null;
  handledBy: { id: string; name: string } | null;
  note: string | null;
}

// ---------- Trips ----------
export interface TripDto {
  id: string;
  startedAt: string;
  endedAt: string;
  /** True when the vehicle is still driving (last fix is part of this trip). */
  ongoing: boolean;
  start: { lat: number; lon: number; place: string | null };
  end: { lat: number; lon: number; place: string | null };
  distanceM: number;
  durationS: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  /** Simplified route, [lon, lat]. */
  path: [number, number][];
}

export interface StopDto {
  startedAt: string;
  endedAt: string;
  durationS: number;
  lat: number;
  lon: number;
  place: string | null;
}

export interface TripsReportDto {
  vehicle: { id: string; name: string; plate: string; type: VehicleType };
  from: string;
  to: string;
  summary: { distanceM: number; drivingS: number; maxSpeedKmh: number; trips: number; events: number };
  trips: TripDto[];
  stops: StopDto[];
  events: AlertDto[];
  lastPosition: { lat: number; lon: number; at: string } | null;
}

export const tripsQuery = z
  .object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) })
  .strict()
  .refine((q) => new Date(q.to) > new Date(q.from), { message: 'range.invalid' })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= 31 * 86_400_000, { message: 'range.too_long' });
