import { Inject, Injectable, Logger } from '@nestjs/common';
import { MOVING_SPEED_KMH } from '@winou/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { deviceAssignments, devices, organizations, vehicleLiveState } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import type { NormalizedPosition } from '../gateway/device-gateway';
import { EVENT_BUS, type EventBus } from '../live/event-bus';
import { LiveService } from '../live/live.service';
import { AlertEngine } from '../alerts/engine';

export interface IngestResult {
  accepted: number;
  duplicates: number;
  unknownDevice: number;
  rejected: number;
}

const MAX_FUTURE_MS = 5 * 60_000;

/**
 * Write side of location data. Runs in system context: an incoming fix is attributed to an
 * organization only through the device's IMEI, never through anything the sender claims.
 */
@Injectable()
export class PositionsService {
  private readonly logger = new Logger('Ingest');
  /** Unknown IMEIs are counted, never auto-registered. */
  readonly unknownImeis = new Map<string, number>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly live: LiveService,
    private readonly engine: AlertEngine,
  ) {}

  async ingest(batch: NormalizedPosition[]): Promise<IngestResult> {
    const r: IngestResult = { accepted: 0, duplicates: 0, unknownDevice: 0, rejected: 0 };
    for (const p of batch) {
      const outcome = await this.one(p);
      r[outcome]++;
    }
    return r;
  }

  private async one(p: NormalizedPosition): Promise<keyof IngestResult> {
    const now = this.clock.now();
    const [dev] = await this.db.system
      .select({
        id: devices.id,
        orgId: devices.orgId,
        retentionDays: organizations.locationRetentionDays,
        vehicleId: deviceAssignments.vehicleId,
      })
      .from(devices)
      .innerJoin(organizations, eq(organizations.id, devices.orgId))
      .leftJoin(deviceAssignments, and(eq(deviceAssignments.deviceId, devices.id), isNull(deviceAssignments.endedAt)))
      .where(and(eq(devices.imei, p.imei), isNull(devices.archivedAt)))
      .limit(1);
    if (!dev) {
      const n = (this.unknownImeis.get(p.imei) ?? 0) + 1;
      if (this.unknownImeis.size < 10_000) this.unknownImeis.set(p.imei, n);
      if (n === 1) this.logger.warn(`Data from unregistered device ${p.imei.slice(0, 4)}… ignored`);
      return 'unknownDevice';
    }

    // The device is alive even if this particular fix is unusable.
    const touch = { lastSeenAt: now, updatedAt: now, ...(p.batteryPct !== null ? { batteryPct: p.batteryPct } : {}) };
    const tooFuture = p.recordedAt.getTime() > now.getTime() + MAX_FUTURE_MS;
    const tooOld = p.recordedAt.getTime() < now.getTime() - dev.retentionDays * 86_400_000;
    if (!p.valid || tooFuture || tooOld || Number.isNaN(p.recordedAt.getTime())) {
      await this.db.system.update(devices).set(touch).where(eq(devices.id, dev.id));
      return 'rejected';
    }

    const outcome = await this.db.system.transaction(async (tx) => {
      const inserted = (await tx.execute(sql`
        insert into positions (org_id, device_id, vehicle_id, recorded_at, received_at, geom, speed_kmh, heading,
                               altitude_m, accuracy_m, satellites, ignition, battery_pct, attrs, source)
        values (${dev.orgId}, ${dev.id}, ${dev.vehicleId}, ${p.recordedAt.toISOString()}, ${now.toISOString()},
                ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography, ${p.speedKmh}, ${p.heading},
                ${p.altitudeM}, ${p.accuracyM}, ${p.satellites}, ${p.ignition}, ${p.batteryPct},
                ${JSON.stringify(p.attrs)}::jsonb, ${p.source})
        on conflict (device_id, recorded_at) do nothing
        returning id`)) as unknown as { rows: unknown[] };
      await tx.update(devices).set(touch).where(eq(devices.id, dev.id));
      if (inserted.rows.length === 0) return 'duplicates' as const;
      if (!dev.vehicleId) return 'stored' as const;

      const [prev] = await tx
        .select()
        .from(vehicleLiveState)
        .where(eq(vehicleLiveState.vehicleId, dev.vehicleId))
        .for('update');
      // Late (buffered) fixes are stored but never move the live marker backwards.
      if (prev && prev.recordedAt > p.recordedAt) return 'stored' as const;

      const moving = p.speedKmh >= MOVING_SPEED_KMH;
      const wasMoving = prev ? prev.speedKmh >= MOVING_SPEED_KMH : false;
      const movingSince = moving ? (prev && wasMoving ? prev.movingSince : p.recordedAt) : null;
      const stoppedSince = moving ? null : (prev && !wasMoving ? prev.stoppedSince : p.recordedAt);
      await tx.execute(sql`
        insert into vehicle_live_state (vehicle_id, org_id, device_id, recorded_at, geom, speed_kmh, heading, ignition,
                                        moving_since, stopped_since, source, updated_at)
        values (${dev.vehicleId}, ${dev.orgId}, ${dev.id}, ${p.recordedAt.toISOString()},
                ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography, ${p.speedKmh}, ${p.heading}, ${p.ignition},
                ${movingSince?.toISOString() ?? null}, ${stoppedSince?.toISOString() ?? null}, ${p.source}, ${now.toISOString()})
        on conflict (vehicle_id) do update set
          device_id = excluded.device_id, recorded_at = excluded.recorded_at, geom = excluded.geom,
          speed_kmh = excluded.speed_kmh, heading = excluded.heading, ignition = excluded.ignition,
          moving_since = excluded.moving_since, stopped_since = excluded.stopped_since,
          source = excluded.source, updated_at = excluded.updated_at`);
      return 'latest' as const;
    });

    if (outcome === 'duplicates') return outcome;
    if (dev.vehicleId && outcome === 'latest') {
      const vehicle = await this.live.vehicle(this.db.system, dev.orgId, dev.vehicleId);
      if (vehicle) this.bus.publish({ orgId: dev.orgId, kind: 'vehicle', vehicle });
      // Alert rules follow the vehicle's newest position only (late fixes never re-trigger).
      await this.engine
        .onPosition(dev.orgId, dev.vehicleId, { at: p.recordedAt, lat: p.lat, lon: p.lon, speedKmh: p.speedKmh, batteryPct: p.batteryPct })
        .catch((e) => this.logger.error(`Alert evaluation failed: ${(e as Error).message}`));
    }
    return 'accepted';
  }
}
