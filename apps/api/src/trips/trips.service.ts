import { Inject, Injectable } from '@nestjs/common';
import type { TripsReportDto } from '@winou/shared';
import { sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/client';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { NotFound } from '../common/errors';
import { AlertsService } from '../alerts/alerts.service';
import { detectTrips, simplify, speedProfile, type Fix } from './detect';

/** Look this far before the requested window so a trip already under way is complete. */
const LOOKBACK_MS = 3 * 3600_000;

/**
 * Trips are computed on read from stored positions, so they always reflect late
 * (buffered) fixes and the current detection rules. Fine for v1 volumes; a cached trips
 * table can be added if reports get slow.
 */
@Injectable()
export class TripsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly alerts: AlertsService,
  ) {}

  report(orgId: string, vehicleId: string, from: Date, to: Date): Promise<TripsReportDto> {
    return this.db.tenant(orgId, async (tx) => {
      const vres = (await tx.execute(sql`select id, name, plate, type from vehicles where id = ${vehicleId}`)) as unknown as {
        rows: { id: string; name: string; plate: string; type: TripsReportDto['vehicle']['type'] }[];
      };
      const vehicle = vres.rows[0];
      if (!vehicle) throw NotFound();

      const pres = (await tx.execute(sql`
        select recorded_at, ST_Y(geom::geometry) as lat, ST_X(geom::geometry) as lon, speed_kmh
        from positions
        where vehicle_id = ${vehicleId}
          and recorded_at >= ${new Date(from.getTime() - LOOKBACK_MS).toISOString()}
          and recorded_at < ${to.toISOString()}
        order by recorded_at
        limit 200000`)) as unknown as { rows: { recorded_at: Date | string; lat: number; lon: number; speed_kmh: number }[] };
      const fixes: Fix[] = pres.rows.map((r) => ({ at: new Date(r.recorded_at), lat: Number(r.lat), lon: Number(r.lon), speedKmh: Number(r.speed_kmh) }));

      const now = this.clock.now();
      const detected = detectTrips(fixes, {}, now < to ? now : to);
      const inRange = detected.trips.filter((t) => t.endedAt >= from && t.startedAt < to);
      const stops = detected.stops.filter((s) => s.endedAt >= from && s.startedAt < to);

      const places = await this.placeNames(
        tx,
        [...inRange.flatMap((t) => [t.start, t.end]), ...stops].map((p) => [p.lon, p.lat] as [number, number]),
      );
      const place = (lon: number, lat: number) => places.get(`${lon},${lat}`) ?? null;

      const events = await this.alerts.forVehicle(tx, orgId, vehicleId, from, to);
      const last = fixes.at(-1);
      return {
        vehicle,
        from: from.toISOString(),
        to: to.toISOString(),
        summary: {
          distanceM: inRange.reduce((a, t) => a + t.distanceM, 0),
          drivingS: inRange.reduce((a, t) => a + t.durationS, 0),
          maxSpeedKmh: inRange.reduce((a, t) => Math.max(a, t.maxSpeedKmh), 0),
          trips: inRange.length,
          events: events.length,
        },
        trips: inRange.map((t) => ({
          id: `${vehicleId}:${t.startedAt.getTime()}`,
          startedAt: t.startedAt.toISOString(),
          endedAt: t.endedAt.toISOString(),
          ongoing: t.ongoing,
          start: { lat: t.start.lat, lon: t.start.lon, place: place(t.start.lon, t.start.lat) },
          end: { lat: t.end.lat, lon: t.end.lon, place: place(t.end.lon, t.end.lat) },
          distanceM: t.distanceM,
          durationS: t.durationS,
          maxSpeedKmh: t.maxSpeedKmh,
          avgSpeedKmh: t.avgSpeedKmh,
          path: simplify(t.fixes),
          speeds: speedProfile(t.fixes),
        })),
        stops: stops.map((s) => ({
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt.toISOString(),
          durationS: s.durationS,
          lat: s.lat,
          lon: s.lon,
          place: place(s.lon, s.lat),
        })),
        events,
        lastPosition: last && last.at >= from ? { lat: last.lat, lon: last.lon, at: last.at.toISOString() } : null,
      };
    });
  }

  /**
   * Names places with the organization's own zones (e.g. "Agence", "Grand Tunis").
   * The smallest zone containing the point wins. Street addresses need a geocoder (not in v1).
   */
  private async placeNames(tx: Tx, points: [number, number][]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()].slice(0, 500);
    if (!unique.length) return out;
    const values = sql.join(unique.map(([lon, lat]) => sql`(${lon}::float8, ${lat}::float8)`), sql`, `);
    const res = (await tx.execute(sql`
      select distinct on (p.lon, p.lat) p.lon, p.lat, g.name
      from (values ${values}) as p(lon, lat)
      join geofences g on ST_Covers(g.geom, ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326)::geography)
      order by p.lon, p.lat, ST_Area(g.geom) asc`)) as unknown as { rows: { lon: number; lat: number; name: string }[] };
    for (const r of res.rows) out.set(`${Number(r.lon)},${Number(r.lat)}`, r.name);
    return out;
  }
}
