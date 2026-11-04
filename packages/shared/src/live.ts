import { DEFAULT_OFFLINE_AFTER_MINUTES, type PlateFormat, type VehicleType } from './enums';

/** Below this speed a vehicle counts as stopped (GPS jitter while parked is usually 0–2 km/h). */
export const MOVING_SPEED_KMH = 3;

export const LIVE_STATUSES = ['moving', 'stopped', 'offline', 'never', 'no_device'] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

export interface VehicleLiveDto {
  vehicleId: string;
  name: string;
  type: VehicleType;
  plate: string;
  plateFormat: PlateFormat;
  device: { id: string; imei: string; lastSeenAt: string | null; batteryPct: number | null } | null;
  position: {
    lat: number;
    lon: number;
    speedKmh: number;
    heading: number | null;
    recordedAt: string;
    ignition: boolean | null;
    movingSince: string | null;
    stoppedSince: string | null;
    /** "simulator" for demo data; shown with a DÉMO label. */
    source: 'device' | 'simulator';
  } | null;
}

/** Live event pushed over the WebSocket. */
export type LiveEvent =
  | { type: 'vehicle'; data: VehicleLiveDto }
  | { type: 'alert'; data: import('./alerts').AlertDto }
  | { type: 'hello'; orgId: string }
  | { type: 'error'; code: string };

export function liveStatus(v: Pick<VehicleLiveDto, 'device' | 'position'>, now: Date = new Date(), offlineAfterMinutes = DEFAULT_OFFLINE_AFTER_MINUTES): LiveStatus {
  if (!v.device) return 'no_device';
  if (!v.device.lastSeenAt) return 'never';
  if (now.getTime() - new Date(v.device.lastSeenAt).getTime() > offlineAfterMinutes * 60_000) return 'offline';
  if (!v.position) return 'never';
  return v.position.speedKmh >= MOVING_SPEED_KMH ? 'moving' : 'stopped';
}
