import { Inject, Injectable } from '@nestjs/common';
import { alertParamsSchemas, type AlertDto, type AlertRuleDto, type AlertType, type CreateAlertRuleInput } from '@winou/shared';
import { desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database, Db, Tx } from '../db/client';
import { alertRules, vehicles } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { BadRequest, NotFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../vehicles/vehicles.service';

interface AlertRow {
  id: string;
  type: AlertType;
  severity: 'urgent' | 'warning';
  status: 'open' | 'handled';
  occurred_at: Date | string;
  rule_id: string | null;
  rule_name: string | null;
  vehicle_id: string;
  vehicle_name: string;
  plate: string;
  vehicle_type: AlertDto['vehicle']['type'];
  lat: number | null;
  lon: number | null;
  details: Record<string, unknown> | string;
  handled_at: Date | string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  note: string | null;
}

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Reads alerts (inbox, timelines) and manages alert rules. */
@Injectable()
export class AlertsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  // ---------- Inbox ----------

  list(orgId: string, q: { status: 'open' | 'handled'; vehicleId?: string; limit: number; before?: string }): Promise<AlertDto[]> {
    return this.db.tenant(orgId, (tx) =>
      this.query(
        tx,
        sql`a.org_id = ${orgId} and a.status = ${q.status}
            ${q.vehicleId ? sql`and a.vehicle_id = ${q.vehicleId}` : sql``}
            ${q.before ? sql`and a.occurred_at < ${q.before}` : sql``}`,
        q.limit,
      ),
    );
  }

  async openCount(orgId: string): Promise<{ open: number; urgent: number }> {
    return this.db.tenant(orgId, async (tx) => {
      const res = (await tx.execute(sql`
        select count(*)::int as open, count(*) filter (where severity = 'urgent')::int as urgent
        from alerts where org_id = ${orgId} and status = 'open'`)) as unknown as { rows: { open: number; urgent: number }[] };
      return res.rows[0]!;
    });
  }

  forVehicle(tx: Tx, orgId: string, vehicleId: string, from: Date, to: Date): Promise<AlertDto[]> {
    return this.query(
      tx,
      sql`a.org_id = ${orgId} and a.vehicle_id = ${vehicleId} and a.occurred_at >= ${from.toISOString()} and a.occurred_at < ${to.toISOString()}`,
      500,
      'asc',
    );
  }

  handle(orgId: string, id: string, note: string | undefined, actor: Actor): Promise<AlertDto> {
    return this.db.tenant(orgId, async (tx) => {
      const res = (await tx.execute(sql`
        update alerts set status = 'handled', handled_by = ${actor.userId}, handled_at = ${this.clock.now().toISOString()}, note = ${note ?? null}
        where id = ${id} and status = 'open' returning id`)) as unknown as { rows: unknown[] };
      if (!res.rows.length) {
        const exists = (await tx.execute(sql`select 1 from alerts where id = ${id}`)) as unknown as { rows: unknown[] };
        if (!exists.rows.length) throw NotFound();
      } else {
        await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'alert.handled', targetType: 'alert', targetId: id, metadata: note ? { note } : {}, ip: actor.ip });
      }
      return (await this.query(tx, sql`a.id = ${id}`, 1))[0]!;
    });
  }

  /** Puts a handled alert back in the inbox (e.g. handled by mistake). The audit log keeps the history. */
  reopen(orgId: string, id: string, actor: Actor): Promise<AlertDto> {
    return this.db.tenant(orgId, async (tx) => {
      const res = (await tx.execute(sql`
        update alerts set status = 'open', handled_by = null, handled_at = null, note = null
        where id = ${id} and status = 'handled' returning id`)) as unknown as { rows: unknown[] };
      if (!res.rows.length) {
        const exists = (await tx.execute(sql`select 1 from alerts where id = ${id}`)) as unknown as { rows: unknown[] };
        if (!exists.rows.length) throw NotFound();
      } else {
        await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'alert.reopened', targetType: 'alert', targetId: id, ip: actor.ip });
      }
      return (await this.query(tx, sql`a.id = ${id}`, 1))[0]!;
    });
  }

  /** Works in tenant (RLS) and system context; used by the engine to publish new alerts. */
  async query(exec: Db | Tx, where: SQL, limit: number, order: 'asc' | 'desc' = 'desc'): Promise<AlertDto[]> {
    const res = (await exec.execute(sql`
      select a.id, a.type, a.severity, a.status, a.occurred_at, a.rule_id, r.name as rule_name,
             v.id as vehicle_id, v.name as vehicle_name, v.plate, v.type as vehicle_type,
             ST_Y(a.geom::geometry) as lat, ST_X(a.geom::geometry) as lon, a.details,
             a.handled_at, a.handled_by, u.name as handled_by_name, a.note
      from alerts a
      join vehicles v on v.id = a.vehicle_id
      left join alert_rules r on r.id = a.rule_id
      left join users u on u.id = a.handled_by
      where ${where}
      order by a.occurred_at ${order === 'asc' ? sql`asc` : sql`desc`}
      limit ${limit}`)) as unknown as { rows: AlertRow[] };
    return res.rows.map((r) => ({
      id: r.id,
      type: r.type,
      severity: r.severity,
      status: r.status,
      occurredAt: iso(r.occurred_at)!,
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      vehicle: { id: r.vehicle_id, name: r.vehicle_name, plate: r.plate, type: r.vehicle_type },
      position: r.lat !== null && r.lon !== null ? { lat: Number(r.lat), lon: Number(r.lon) } : null,
      details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      handledAt: iso(r.handled_at),
      handledBy: r.handled_by ? { id: r.handled_by, name: r.handled_by_name ?? '' } : null,
      note: r.note,
    }));
  }

  // ---------- Rules ----------

  listRules(orgId: string): Promise<AlertRuleDto[]> {
    return this.db.tenant(orgId, async (tx) =>
      (await tx.select().from(alertRules).where(eq(alertRules.orgId, orgId)).orderBy(desc(alertRules.createdAt))).map(toRuleDto),
    );
  }

  createRule(orgId: string, input: CreateAlertRuleInput, actor: Actor): Promise<AlertRuleDto> {
    return this.db.tenant(orgId, async (tx) => {
      await this.checkRefs(tx, input.type, input.params as Record<string, unknown>, input.vehicleIds);
      const [row] = await tx
        .insert(alertRules)
        .values({
          orgId,
          type: input.type,
          name: input.name,
          enabled: input.enabled,
          severity: input.severity,
          params: input.params as Record<string, unknown>,
          vehicleIds: input.vehicleIds,
          createdBy: actor.userId,
        })
        .returning();
      await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'alert_rule.created', targetType: 'alert_rule', targetId: row!.id, metadata: { type: input.type, name: input.name, params: input.params }, ip: actor.ip });
      return toRuleDto(row!);
    });
  }

  updateRule(
    orgId: string,
    id: string,
    patch: { name?: string; enabled?: boolean; severity?: 'urgent' | 'warning'; vehicleIds?: string[] | null; params?: Record<string, unknown> },
    actor: Actor,
  ): Promise<AlertRuleDto> {
    return this.db.tenant(orgId, async (tx) => {
      const [current] = await tx.select().from(alertRules).where(eq(alertRules.id, id));
      if (!current) throw NotFound();
      let params = current.params;
      if (patch.params !== undefined) {
        const parsed = alertParamsSchemas[current.type].safeParse(patch.params);
        if (!parsed.success) throw BadRequest('validation');
        params = parsed.data as Record<string, unknown>;
      }
      const vehicleIds = patch.vehicleIds === undefined ? current.vehicleIds : patch.vehicleIds;
      await this.checkRefs(tx, current.type, params, vehicleIds);
      const [row] = await tx
        .update(alertRules)
        .set({
          name: patch.name ?? current.name,
          enabled: patch.enabled ?? current.enabled,
          severity: patch.severity ?? current.severity,
          params,
          vehicleIds,
          updatedAt: this.clock.now(),
        })
        .where(eq(alertRules.id, id))
        .returning();
      // Changed conditions start from a clean slate.
      if (patch.params !== undefined || patch.enabled === false) {
        await tx.execute(sql`delete from alert_states where rule_id = ${id}`);
      }
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'alert_rule.updated',
        targetType: 'alert_rule',
        targetId: id,
        metadata: { fields: Object.keys(patch), ...(patch.params ? { params } : {}), ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}) },
        ip: actor.ip,
      });
      return toRuleDto(row!);
    });
  }

  deleteRule(orgId: string, id: string, actor: Actor): Promise<void> {
    return this.db.tenant(orgId, async (tx) => {
      const [row] = await tx.delete(alertRules).where(eq(alertRules.id, id)).returning();
      if (!row) throw NotFound();
      await this.audit.record(tx, { orgId, actorUserId: actor.userId, action: 'alert_rule.deleted', targetType: 'alert_rule', targetId: id, metadata: { type: row.type, name: row.name }, ip: actor.ip });
    });
  }

  /** Zones and vehicles referenced by a rule must belong to the same organization (RLS makes others invisible). */
  private async checkRefs(tx: Tx, type: AlertType, params: Record<string, unknown>, vehicleIds: string[] | null) {
    if (type === 'geofence_exit' || type === 'geofence_enter') {
      const res = (await tx.execute(sql`select 1 from geofences where id = ${String(params.geofenceId)}`)) as unknown as { rows: unknown[] };
      if (!res.rows.length) throw BadRequest('zone.not_found');
    }
    if (vehicleIds?.length) {
      const found = await tx.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.id, vehicleIds));
      if (found.length !== new Set(vehicleIds).size) throw BadRequest('vehicle.not_found');
    }
  }
}

function toRuleDto(r: typeof alertRules.$inferSelect): AlertRuleDto {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    enabled: r.enabled,
    severity: r.severity,
    vehicleIds: r.vehicleIds ?? null,
    params: r.params,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

