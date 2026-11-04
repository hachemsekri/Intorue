/**
 * The only boundary between the platform and the software that talks to GPS hardware.
 * Today that software is Traccar; nothing outside src/gateway knows about Traccar.
 *
 * There is deliberately no "send command" method: the platform never sends commands to
 * devices (no engine cut-off, no immobilisation).
 */
export interface NormalizedPosition {
  /** Device identifier as reported by the hardware (IMEI for the devices we support). */
  imei: string;
  recordedAt: Date;
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number | null;
  altitudeM: number | null;
  accuracyM: number | null;
  satellites: number | null;
  ignition: boolean | null;
  batteryPct: number | null;
  /** False when the device says the fix is not valid (no GPS lock). */
  valid: boolean;
  source: 'device' | 'simulator';
  /** Extra protocol attributes worth keeping (bounded in size). */
  attrs: Record<string, unknown>;
}

export interface DeviceGateway {
  readonly name: string;
  /** Converts a raw gateway payload into zero or more normalized positions; throws on invalid input. */
  normalize(payload: unknown): NormalizedPosition[];
}
