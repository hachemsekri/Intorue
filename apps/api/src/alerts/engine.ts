import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { alertParamsSchemas, type AlertParams, type AlertType } from '@winou/shared';
import { sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import type { Database, Tx } from '../db/client';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { EVENT_BUS, type EventBus } from '../live/event-bus';
import { AlertsService } from './alerts.service';
import { PushService } from '../push/push.service';
import * as ev from './evaluate';

interface RuleRow {
  id: string;
  type: AlertType;
  severity: 'urgent' | 'warning';
  params: Record<string, unknown> | string;
  vehicle_ids: string[] | null;
}

export interface EngineFix {
  at: Date;
  lat: number;
  lon: number;
  speedKmh: number;
  batteryPct: number | null;
}

const parseJson = <T>(v: T | string): T => (typeof v === 'string' ? (JSON.parse(v) as T) : v);
const appliesTo = (r: RuleRow, vehicleId: string) => !r.vehicle_ids || r.vehicle_ids.includes(vehicleId);

/**
 * Runs alert rules. Position rules run on every new (latest) fix; the offline rule runs
 * every minute. System context: it reads rules of the fix's own organization only.
 */
@Injectable()
export class AlertEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Alerts');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(ENV) private readonly env: Env,
    private readonly alerts: AlertsService,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.checkOffline().catch((e) => this.logger.error(e)), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async onPosition(orgId: string, vehicleId: string, fix: EngineFix): Promise<number> {
    const rules = (await this.rules(orgId)).filter((r) => appliesTo(r, vehicleId));
    if (!rules.length) return 0;

    const zoneIds = rules.filter((r) => r.type === 'geofence_exit' || r.type === 'geofence_enter').map((r) => String(parseJson(r.params).geofenceId));
    const inside = new Set<string>();
    const zoneNames = new Map<string, string>();
    if (zoneIds.length) {
      const res = (await this.db.system.execute(sql`
        select id, name, ST_Covers(geom, ST_SetSRID(ST_MakePoint(${fix.lon}, ${fix.lat}), 4326)::geography) as inside
        from geofences where org_id = ${orgId} and id in (${sql.join(zoneIds.map((z) => sql`${z}`), sql`, `)})`)) as unknown as {
        rows: { id: string; name: string; inside: boolean }[];
      };
      for (const z of res.rows) {
        zoneNames.set(z.id, z.name);
        if (z.inside) inside.add(z.id);
      }
    }
    const vres = (await this.db.system.execute(sql`select speed_limit_kmh from vehicles where id = ${vehicleId}`)) as unknown as {
      rows: { speed_limit_kmh: number | null }[];
    };
    const facts: ev.PositionFacts = {
      at: fix.at,
      speedKmh: fix.speedKmh,
      batteryPct: fix.batteryPct,
      insideZones: inside,
      vehicleSpeedLimitKmh: vres.rows[0]?.speed_limit_kmh ?? null,
    };

    return this.withStates(orgId, vehicleId, rules, async (rule, state) => {
      const p = alertParamsSchemas[rule.type].parse(parseJson(rule.params)) as AlertParams[AlertType];
      switch (rule.type) {
        case 'speeding':
          return ev.speeding(p as AlertParams['speeding'], state, facts);
        case 'low_battery':
          return ev.lowBattery(p as AlertParams['low_battery'], state, facts);
        case 'movement_schedule':
          return ev.movementSchedule(p as AlertParams['movement_schedule'], state, facts);
        case 'geofence_exit':
        case 'geofence_enter': {
          const id = (p as AlertParams['geofence_exit']).geofenceId;
          if (!zoneNames.has(id)) return { state };
          return ev.zoneTransition(rule.type === 'geofence_exit' ? 'exit' : 'enter', id, state, facts, zoneNames.get(id)!);
        }
        case 'device_offline':
          return { state: {} }; // the device just reported: re-arm
      }
    }, fix);
  }

  /** Every minute: devices that stopped reporting. */
  async checkOffline(): Promise<number> {
    const now = this.clock.now();
    const res = (await this.db.system.execute(sql`
      select r.org_id, r.id as rule_id, r.type, r.severity, r.params, r.vehicle_ids,
             v.id as vehicle_id, d.last_seen_at,
             ST_Y(ls.geom::geometry) as lat, ST_X(ls.geom::geometry) as lon
      from alert_rules r
      join vehicles v on v.org_id = r.org_id and v.archived_at is null
      join device_assignments da on da.vehicle_id = v.id and da.ended_at is null
      join devices d on d.id = da.device_id
      left join vehicle_live_state ls on ls.vehicle_id = v.id
      where r.enabled and r.type = 'device_offline'
        and (r.vehicle_ids is null or v.id = any(r.vehicle_ids))`)) as unknown as {
      rows: (RuleRow & { org_id: string; rule_id: string; vehicle_id: string; last_seen_at: Date | string | null; lat: number | null; lon: number | null })[];
    };
    let fired = 0;
    for (const row of res.rows) {
      const rule: RuleRow = { id: row.rule_id, type: row.type, severity: row.severity, params: row.params, vehicle_ids: row.vehicle_ids };
      const lastSeen = row.last_seen_at ? new Date(row.last_seen_at) : null;
      fired += await this.withStates(
        row.org_id,
        row.vehicle_id,
        [rule],
        async (r, state) => ev.deviceOffline(alertParamsSchemas.device_offline.parse(parseJson(r.params)), state, lastSeen, now),
        row.lat !== null && row.lon !== null ? { at: now, lat: Number(row.lat), lon: Number(row.lon), speedKmh: 0, batteryPct: null } : { at: now, lat: NaN, lon: NaN, speedKmh: 0, batteryPct: null },
      );
    }
    return fired;
  }

  private async rules(orgId: string): Promise<RuleRow[]> {
    const res = (await this.db.system.execute(sql`
      select id, type, severity, params, vehicle_ids from alert_rules where org_id = ${orgId} and enabled`)) as unknown as { rows: RuleRow[] };
    return res.rows;
  }

  /** Loads states, evaluates, saves states and new alerts in one transaction, then publishes. */
  private async withStates(
    orgId: string,
    vehicleId: string,
    rules: RuleRow[],
    evaluate: (rule: RuleRow, state: ev.State) => Promise<ev.Result>,
    where: EngineFix,
  ): Promise<number> {
    const newIds = await this.db.system.transaction(async (tx: Tx) => {
      const ids = rules.map((r) => r.id);
      const res = (await tx.execute(sql`
        select rule_id, state from alert_states
        where vehicle_id = ${vehicleId} and rule_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
        for update`)) as unknown as { rows: { rule_id: string; state: ev.State | string }[] };
      const states = new Map(res.rows.map((r) => [r.rule_id, parseJson(r.state)]));
      const created: string[] = [];
      for (const rule of rules) {
        const before = states.get(rule.id) ?? {};
        const out = await evaluate(rule, before);
        if (JSON.stringify(out.state) !== JSON.stringify(before)) {
          await tx.execute(sql`
            insert into alert_states (rule_id, vehicle_id, org_id, state, updated_at)
            values (${rule.id}, ${vehicleId}, ${orgId}, ${JSON.stringify(out.state)}::jsonb, ${this.clock.now().toISOString()})
            on conflict (rule_id, vehicle_id) do update set state = excluded.state, updated_at = excluded.updated_at`);
        }
        if (out.fire) {
          const point = Number.isFinite(where.lat) ? sql`ST_SetSRID(ST_MakePoint(${where.lon}, ${where.lat}), 4326)::geography` : sql`null`;
          const ins = (await tx.execute(sql`
            insert into alerts (org_id, rule_id, vehicle_id, type, severity, occurred_at, geom, details)
            values (${orgId}, ${rule.id}, ${vehicleId}, ${rule.type}, ${rule.severity}, ${where.at.toISOString()}, ${point}, ${JSON.stringify(out.fire.details)}::jsonb)
            returning id`)) as unknown as { rows: { id: string }[] };
          created.push(ins.rows[0]!.id);
        }
      }
      return created;
    });
    for (const id of newIds) {
      const [dto] = await this.alerts.query(this.db.system, sql`a.id = ${id}`, 1);
      if (!dto) continue;
      this.bus.publish({ orgId, kind: 'alert', alert: dto });
      await this.push.notifyAlert(orgId, dto).catch((e) => this.logger.warn(`Push failed: ${(e as Error).message}`));
    }
    return newIds.length;
  }
}
