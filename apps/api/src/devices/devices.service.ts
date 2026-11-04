import { Inject, Injectable } from '@nestjs/common';
import { deviceStatus, type DeviceDto } from '@winou/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { isUniqueViolation, type Database, type Tx } from '../db/client';
import { deviceAssignments, devices, vehicles } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { Conflict, NotFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../vehicles/vehicles.service';

const IMEI_UQ = 'devices_imei_active_uq';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  list(orgId: string, f: { archived?: boolean }): Promise<DeviceDto[]> {
    return this.db.tenant(orgId, async (tx) => {
      const rows = await this.baseQuery(tx)
        .where(
          and(eq(devices.orgId, orgId), f.archived ? isNotNull(devices.archivedAt) : isNull(devices.archivedAt)),
        )
        .orderBy(devices.createdAt);
      return rows.map((r) => this.toDto(r));
    });
  }

  get(orgId: string, id: string): Promise<DeviceDto> {
    return this.db.tenant(orgId, (tx) => this.getIn(tx, id));
  }

  /**
   * Registers a device by IMEI. An IMEI can be active in only one organization; the
   * conflict message does not say which organization holds it.
   */
  async create(
    orgId: string,
    input: { imei: string; label?: string | null; model?: string | null },
    actor: Actor,
  ): Promise<DeviceDto> {
    try {
      return await this.db.tenant(orgId, async (tx) => {
        const [d] = await tx
          .insert(devices)
          .values({ orgId, imei: input.imei, label: input.label ?? null, model: input.model ?? null })
          .returning({ id: devices.id });
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'device.created',
          targetType: 'device',
          targetId: d!.id,
          metadata: { imei: input.imei },
          ip: actor.ip,
        });
        return this.getIn(tx, d!.id);
      });
    } catch (e) {
      if (isUniqueViolation(e, IMEI_UQ)) throw Conflict('imei.already_registered');
      throw e;
    }
  }

  update(orgId: string, id: string, input: { label?: string | null; model?: string | null }, actor: Actor) {
    return this.db.tenant(orgId, async (tx) => {
      const patch: Partial<typeof devices.$inferInsert> = { updatedAt: this.clock.now() };
      if (input.label !== undefined) patch.label = input.label;
      if (input.model !== undefined) patch.model = input.model;
      const [d] = await tx.update(devices).set(patch).where(eq(devices.id, id)).returning({ id: devices.id });
      if (!d) throw NotFound();
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'device.updated',
        targetType: 'device',
        targetId: id,
        metadata: { fields: Object.keys(input) },
        ip: actor.ip,
      });
      return this.getIn(tx, id);
    });
  }

  archive(orgId: string, id: string, actor: Actor): Promise<DeviceDto> {
    return this.db.tenant(orgId, async (tx) => {
      const now = this.clock.now();
      const [d] = await tx
        .update(devices)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(devices.id, id), isNull(devices.archivedAt)))
        .returning({ id: devices.id });
      if (!d) throw NotFound();
      await tx
        .update(deviceAssignments)
        .set({ endedAt: now })
        .where(and(eq(deviceAssignments.deviceId, id), isNull(deviceAssignments.endedAt)));
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'device.archived',
        targetType: 'device',
        targetId: id,
        ip: actor.ip,
      });
      return this.getIn(tx, id);
    });
  }

  /** One device per vehicle and one vehicle per device. Unlink first to move a device. */
  async link(orgId: string, deviceId: string, vehicleId: string, actor: Actor): Promise<DeviceDto> {
    try {
      return await this.db.tenant(orgId, async (tx) => {
        const [d] = await tx.select().from(devices).where(eq(devices.id, deviceId)).for('update');
        if (!d) throw NotFound();
        if (d.archivedAt) throw Conflict('device.archived');
        const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for('update');
        if (!v) throw NotFound();
        if (v.archivedAt) throw Conflict('vehicle.archived');

        const active = await tx
          .select()
          .from(deviceAssignments)
          .where(isNull(deviceAssignments.endedAt))
          .then((rows) => rows.filter((a) => a.deviceId === deviceId || a.vehicleId === vehicleId));
        if (active.some((a) => a.deviceId === deviceId)) throw Conflict('device.already_linked');
        if (active.some((a) => a.vehicleId === vehicleId)) throw Conflict('vehicle.already_has_device');

        await tx.insert(deviceAssignments).values({ orgId, deviceId, vehicleId, createdBy: actor.userId });
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'device.linked',
          targetType: 'device',
          targetId: deviceId,
          metadata: { imei: d.imei, vehicleId, plate: v.plate },
          ip: actor.ip,
        });
        return this.getIn(tx, deviceId);
      });
    } catch (e) {
      if (isUniqueViolation(e, 'device_assignments_device_active_uq')) throw Conflict('device.already_linked');
      if (isUniqueViolation(e, 'device_assignments_vehicle_active_uq')) throw Conflict('vehicle.already_has_device');
      throw e;
    }
  }

  unlink(orgId: string, deviceId: string, actor: Actor): Promise<DeviceDto> {
    return this.db.tenant(orgId, async (tx) => {
      const [d] = await tx.select({ imei: devices.imei }).from(devices).where(eq(devices.id, deviceId));
      if (!d) throw NotFound();
      const ended = await tx
        .update(deviceAssignments)
        .set({ endedAt: this.clock.now() })
        .where(and(eq(deviceAssignments.deviceId, deviceId), isNull(deviceAssignments.endedAt)))
        .returning({ vehicleId: deviceAssignments.vehicleId });
      if (ended.length) {
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'device.unlinked',
          targetType: 'device',
          targetId: deviceId,
          metadata: { imei: d.imei, vehicleId: ended[0]!.vehicleId },
          ip: actor.ip,
        });
      }
      return this.getIn(tx, deviceId);
    });
  }

  private baseQuery(tx: Tx) {
    return tx
      .select({ d: devices, v: vehicles })
      .from(devices)
      .leftJoin(deviceAssignments, and(eq(deviceAssignments.deviceId, devices.id), isNull(deviceAssignments.endedAt)))
      .leftJoin(vehicles, eq(vehicles.id, deviceAssignments.vehicleId));
  }

  private async getIn(tx: Tx, id: string): Promise<DeviceDto> {
    const [row] = await this.baseQuery(tx).where(eq(devices.id, id)).limit(1);
    if (!row) throw NotFound();
    return this.toDto(row);
  }

  private toDto({ d, v }: { d: typeof devices.$inferSelect; v: typeof vehicles.$inferSelect | null }): DeviceDto {
    return {
      id: d.id,
      imei: d.imei,
      label: d.label,
      model: d.model,
      status: deviceStatus(d.lastSeenAt, this.clock.now()),
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      batteryPct: d.batteryPct,
      archivedAt: d.archivedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      vehicle: v ? { id: v.id, name: v.name, plate: v.plate, type: v.type } : null,
    };
  }
}
