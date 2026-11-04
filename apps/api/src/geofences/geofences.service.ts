import { Inject, Injectable } from '@nestjs/common';
import type { GeofenceDto, GeofenceShape } from '@winou/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Database, Tx } from '../db/client';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { BadRequest, Conflict, NotFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../vehicles/vehicles.service';

interface Row {
  id: string;
  name: string;
  shape: GeofenceShape;
  geojson: string;
  created_at: Date | string;
}

/** SQL for the stored area: circles become buffered polygons (~64 vertices). */
function geomSql(shape: GeofenceShape): SQL {
  if (shape.kind === 'circle') {
    const [lon, lat] = shape.center;
    return sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${shape.radiusM}, 'quad_segs=16')`;
  }
  const pts = [...shape.points];
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  const wkt = `POLYGON((${pts.map(([x, y]) => `${Number(x)} ${Number(y)}`).join(', ')}))`;
  return sql`ST_GeogFromText(${wkt})`;
}

@Injectable()
export class GeofencesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  list(orgId: string): Promise<GeofenceDto[]> {
    return this.db.tenant(orgId, (tx) => this.query(tx, sql`org_id = ${orgId}`));
  }

  get(orgId: string, id: string): Promise<GeofenceDto> {
    return this.db.tenant(orgId, async (tx) => {
      const [g] = await this.query(tx, sql`id = ${id}`);
      if (!g) throw NotFound();
      return g;
    });
  }

  async create(orgId: string, input: { name: string; shape: GeofenceShape }, actor: Actor): Promise<GeofenceDto> {
    await this.assertValid(input.shape);
    return this.db.tenant(orgId, async (tx) => {
      const res = (await tx.execute(sql`
        insert into geofences (org_id, name, kind, shape, geom)
        values (${orgId}, ${input.name}, ${input.shape.kind}, ${JSON.stringify(input.shape)}::jsonb, ${geomSql(input.shape)})
        returning id`)) as unknown as { rows: { id: string }[] };
      const id = res.rows[0]!.id;
      await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'zone.created', targetType: 'zone', targetId: id, metadata: { name: input.name, kind: input.shape.kind }, ip: actor.ip });
      return (await this.query(tx, sql`id = ${id}`))[0]!;
    });
  }

  async update(orgId: string, id: string, input: { name?: string; shape?: GeofenceShape }, actor: Actor): Promise<GeofenceDto> {
    if (input.shape) await this.assertValid(input.shape);
    return this.db.tenant(orgId, async (tx) => {
      const sets: SQL[] = [sql`updated_at = ${this.clock.now().toISOString()}`];
      if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
      if (input.shape) sets.push(sql`kind = ${input.shape.kind}`, sql`shape = ${JSON.stringify(input.shape)}::jsonb`, sql`geom = ${geomSql(input.shape)}`);
      const res = (await tx.execute(sql`update geofences set ${sql.join(sets, sql`, `)} where id = ${id} returning id`)) as unknown as { rows: unknown[] };
      if (!res.rows.length) throw NotFound();
      if (input.shape) {
        // Zone moved: zone rules must re-learn whether each vehicle is inside.
        await tx.execute(sql`delete from alert_states s using alert_rules r
          where s.rule_id = r.id and r.params->>'geofenceId' = ${id}`);
      }
      await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'zone.updated', targetType: 'zone', targetId: id, metadata: { fields: Object.keys(input) }, ip: actor.ip });
      return (await this.query(tx, sql`id = ${id}`))[0]!;
    });
  }

  remove(orgId: string, id: string, actor: Actor): Promise<void> {
    return this.db.tenant(orgId, async (tx) => {
      const used = (await tx.execute(sql`select 1 from alert_rules where params->>'geofenceId' = ${id} limit 1`)) as unknown as { rows: unknown[] };
      if (used.rows.length) throw Conflict('zone.in_use');
      const res = (await tx.execute(sql`delete from geofences where id = ${id} returning name`)) as unknown as { rows: { name: string }[] };
      if (!res.rows.length) throw NotFound();
      await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'zone.deleted', targetType: 'zone', targetId: id, metadata: { name: res.rows[0]!.name }, ip: actor.ip });
    });
  }

  /** Polygons must not self-intersect and must cover a sensible area (≤ 50 000 km²). */
  private async assertValid(shape: GeofenceShape) {
    if (shape.kind === 'circle') return;
    const res = (await this.db.system.execute(sql`
      select ST_IsValid(g::geometry) as valid, ST_Area(g) as area from (select ${geomSql(shape)} as g) x`)) as unknown as {
      rows: { valid: boolean; area: number }[];
    };
    const r = res.rows[0];
    if (!r?.valid || !(Number(r.area) > 100) || Number(r.area) > 5e10) throw BadRequest('zone.invalid');
  }

  private async query(tx: Tx, where: SQL): Promise<GeofenceDto[]> {
    const res = (await tx.execute(sql`
      select id, name, shape, ST_AsGeoJSON(geom, 6) as geojson, created_at
      from geofences where ${where} order by name`)) as unknown as { rows: Row[] };
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      shape: typeof r.shape === 'string' ? JSON.parse(r.shape) : r.shape,
      ring: (JSON.parse(r.geojson) as { coordinates: [number, number][][] }).coordinates[0]!,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }
}
