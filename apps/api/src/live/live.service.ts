import { Inject, Injectable } from '@nestjs/common';
import type { VehicleLiveDto } from '@winou/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Database, Db, Tx } from '../db/client';
import { DB } from '../common/tokens';

interface Row {
  vehicle_id: string;
  name: string;
  type: VehicleLiveDto['type'];
  plate: string;
  plate_format: VehicleLiveDto['plateFormat'];
  device_id: string | null;
  imei: string | null;
  last_seen_at: Date | string | null;
  battery_pct: number | null;
  recorded_at: Date | string | null;
  lat: number | null;
  lon: number | null;
  speed_kmh: number | null;
  heading: number | null;
  ignition: boolean | null;
  moving_since: Date | string | null;
  stopped_since: Date | string | null;
  source: 'device' | 'simulator' | null;
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Read side of the live map: one row per active vehicle with its device and latest position. */
@Injectable()
export class LiveService {
  constructor(@Inject(DB) private readonly db: Database) {}

  snapshot(orgId: string): Promise<VehicleLiveDto[]> {
    return this.db.tenant(orgId, (tx) => this.query(tx, sql`v.org_id = ${orgId}`));
  }

  /** System context: used by the ingest pipeline to build the event it publishes. */
  async vehicle(exec: Db | Tx, orgId: string, vehicleId: string): Promise<VehicleLiveDto | undefined> {
    const [v] = await this.query(exec, sql`v.org_id = ${orgId} and v.id = ${vehicleId}`);
    return v;
  }

  private async query(exec: Db | Tx, where: SQL): Promise<VehicleLiveDto[]> {
    const res = (await exec.execute(sql`
      select v.id as vehicle_id, v.name, v.type, v.plate, v.plate_format,
             d.id as device_id, d.imei, d.last_seen_at, d.battery_pct,
             ls.recorded_at, ST_Y(ls.geom::geometry) as lat, ST_X(ls.geom::geometry) as lon,
             ls.speed_kmh, ls.heading, ls.ignition, ls.moving_since, ls.stopped_since, ls.source
      from vehicles v
      left join device_assignments da on da.vehicle_id = v.id and da.ended_at is null
      left join devices d on d.id = da.device_id
      left join vehicle_live_state ls on ls.vehicle_id = v.id
      where v.archived_at is null and ${where}
      order by v.name`)) as unknown as { rows: Row[] };
    return res.rows.map((r) => ({
      vehicleId: r.vehicle_id,
      name: r.name,
      type: r.type,
      plate: r.plate,
      plateFormat: r.plate_format,
      device: r.device_id
        ? { id: r.device_id, imei: r.imei!, lastSeenAt: iso(r.last_seen_at), batteryPct: r.battery_pct }
        : null,
      position:
        r.recorded_at && r.lat !== null && r.lon !== null
          ? {
              lat: Number(r.lat),
              lon: Number(r.lon),
              speedKmh: Number(r.speed_kmh ?? 0),
              heading: r.heading,
              recordedAt: iso(r.recorded_at)!,
              ignition: r.ignition,
              movingSince: iso(r.moving_since),
              stoppedSince: iso(r.stopped_since),
              source: r.source ?? 'device',
            }
          : null,
    }));
  }
}
