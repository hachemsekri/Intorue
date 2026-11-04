import { Inject, Injectable } from '@nestjs/common';
import {
  deviceStatus,
  parsePlate,
  type CreateVehicleInput,
  type UpdateVehicleInput,
  type VehicleDto,
  type VehicleType,
} from '@winou/shared';
import { and, desc, eq, ilike, isNotNull, isNull, or } from 'drizzle-orm';
import { isUniqueViolation, type Database, type Tx } from '../db/client';
import { deviceAssignments, devices, vehicles } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { BadRequest, Conflict, NotFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';

export interface Actor {
  userId: string;
  ip?: string;
}

const PLATE_UQ = 'vehicles_plate_active_uq';

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  list(orgId: string, f: { q?: string; type?: VehicleType; archived?: boolean }): Promise<VehicleDto[]> {
    return this.db.tenant(orgId, async (tx) => {
      const like = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : undefined;
      const rows = await this.baseQuery(tx)
        .where(
          and(
            eq(vehicles.orgId, orgId),
            f.archived ? isNotNull(vehicles.archivedAt) : isNull(vehicles.archivedAt),
            f.type ? eq(vehicles.type, f.type) : undefined,
            like ? or(ilike(vehicles.name, like), ilike(vehicles.plate, like)) : undefined,
          ),
        )
        .orderBy(vehicles.name);
      return rows.map((r) => this.toDto(r));
    });
  }

  get(orgId: string, id: string): Promise<VehicleDto> {
    return this.db.tenant(orgId, (tx) => this.getIn(tx, id));
  }

  async create(orgId: string, input: CreateVehicleInput, actor: Actor): Promise<VehicleDto> {
    const plate = parsePlate(input.plate, input.plateFormat)!;
    try {
      return await this.db.tenant(orgId, async (tx) => {
        const [v] = await tx
          .insert(vehicles)
          .values({
            orgId,
            type: input.type,
            name: input.name,
            make: input.make ?? null,
            model: input.model ?? null,
            color: input.color ?? null,
            plate: plate.normalized,
            plateFormat: plate.format,
            speedLimitKmh: input.speedLimitKmh ?? null,
          })
          .returning({ id: vehicles.id });
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'vehicle.created',
          targetType: 'vehicle',
          targetId: v!.id,
          metadata: { plate: plate.normalized, type: input.type },
          ip: actor.ip,
        });
        return this.getIn(tx, v!.id);
      });
    } catch (e) {
      if (isUniqueViolation(e, PLATE_UQ)) throw Conflict('plate.duplicate');
      throw e;
    }
  }

  async update(orgId: string, id: string, input: UpdateVehicleInput, actor: Actor): Promise<VehicleDto> {
    try {
      return await this.db.tenant(orgId, async (tx) => {
        const [current] = await tx.select().from(vehicles).where(eq(vehicles.id, id));
        if (!current) throw NotFound();
        const patch: Partial<typeof vehicles.$inferInsert> = { updatedAt: this.clock.now() };
        for (const k of ['type', 'name', 'make', 'model', 'color', 'speedLimitKmh'] as const) {
          if (input[k] !== undefined) (patch as Record<string, unknown>)[k] = input[k];
        }
        if (input.plate !== undefined || input.plateFormat !== undefined) {
          const parsed = parsePlate(input.plate ?? current.plate, input.plateFormat ?? undefined);
          if (!parsed) throw BadRequest('plate.invalid');
          patch.plate = parsed.normalized;
          patch.plateFormat = parsed.format;
        }
        await tx.update(vehicles).set(patch).where(eq(vehicles.id, id));
        const changed = Object.keys(patch).filter((k) => k !== 'updatedAt');
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'vehicle.updated',
          targetType: 'vehicle',
          targetId: id,
          metadata: { fields: changed },
          ip: actor.ip,
        });
        return this.getIn(tx, id);
      });
    } catch (e) {
      if (isUniqueViolation(e, PLATE_UQ)) throw Conflict('plate.duplicate');
      throw e;
    }
  }

  /** Archiving also unlinks the vehicle's device, keeping the assignment history. */
  archive(orgId: string, id: string, actor: Actor): Promise<VehicleDto> {
    return this.db.tenant(orgId, async (tx) => {
      const now = this.clock.now();
      const [v] = await tx
        .update(vehicles)
        .set({ archivedAt: now, updatedAt: now })
        .where(and(eq(vehicles.id, id), isNull(vehicles.archivedAt)))
        .returning({ id: vehicles.id });
      if (!v) throw NotFound();
      const ended = await tx
        .update(deviceAssignments)
        .set({ endedAt: now })
        .where(and(eq(deviceAssignments.vehicleId, id), isNull(deviceAssignments.endedAt)))
        .returning({ deviceId: deviceAssignments.deviceId });
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'vehicle.archived',
        targetType: 'vehicle',
        targetId: id,
        metadata: ended.length ? { unlinkedDeviceId: ended[0]!.deviceId } : {},
        ip: actor.ip,
      });
      return this.getIn(tx, id);
    });
  }

  async unarchive(orgId: string, id: string, actor: Actor): Promise<VehicleDto> {
    try {
      return await this.db.tenant(orgId, async (tx) => {
        const [v] = await tx
          .update(vehicles)
          .set({ archivedAt: null, updatedAt: this.clock.now() })
          .where(and(eq(vehicles.id, id), isNotNull(vehicles.archivedAt)))
          .returning({ id: vehicles.id });
        if (!v) throw NotFound();
        await this.audit.record(tx, {
          orgId,
          actorUserId: actor.userId,
          action: 'vehicle.unarchived',
          targetType: 'vehicle',
          targetId: id,
          ip: actor.ip,
        });
        return this.getIn(tx, id);
      });
    } catch (e) {
      if (isUniqueViolation(e, PLATE_UQ)) throw Conflict('plate.duplicate');
      throw e;
    }
  }

  private baseQuery(tx: Tx) {
    return tx
      .select({ v: vehicles, d: devices })
      .from(vehicles)
      .leftJoin(
        deviceAssignments,
        and(eq(deviceAssignments.vehicleId, vehicles.id), isNull(deviceAssignments.endedAt)),
      )
      .leftJoin(devices, eq(devices.id, deviceAssignments.deviceId));
  }

  private async getIn(tx: Tx, id: string): Promise<VehicleDto> {
    const [row] = await this.baseQuery(tx).where(eq(vehicles.id, id)).orderBy(desc(vehicles.createdAt)).limit(1);
    if (!row) throw NotFound();
    return this.toDto(row);
  }

  private toDto({ v, d }: { v: typeof vehicles.$inferSelect; d: typeof devices.$inferSelect | null }): VehicleDto {
    return {
      id: v.id,
      type: v.type,
      name: v.name,
      make: v.make,
      model: v.model,
      color: v.color,
      plate: v.plate,
      plateFormat: v.plateFormat,
      speedLimitKmh: v.speedLimitKmh,
      archivedAt: v.archivedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      device: d
        ? {
            id: d.id,
            imei: d.imei,
            status: deviceStatus(d.lastSeenAt, this.clock.now()),
            lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          }
        : null,
    };
  }
}
