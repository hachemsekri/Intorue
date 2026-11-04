import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntryDto } from '@winou/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { Database, Db, Tx } from '../db/client';
import { auditLog, users } from '../db/schema';
import { DB } from '../common/tokens';

export type AuditAction =
  | 'auth.login_failed'
  | 'auth.password_reset'
  | 'org.created'
  | 'org.updated'
  | 'member.invited'
  | 'member.role_changed'
  | 'member.removed'
  | 'invitation.accepted'
  | 'invitation.revoked'
  | 'vehicle.created'
  | 'vehicle.updated'
  | 'vehicle.archived'
  | 'vehicle.unarchived'
  | 'device.created'
  | 'device.updated'
  | 'device.archived'
  | 'device.linked'
  | 'device.unlinked';

export interface AuditEntry {
  orgId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Write inside the caller's transaction so the audit row commits or rolls back with the change. */
  async record(exec: Db | Tx, e: AuditEntry): Promise<void> {
    await exec.insert(auditLog).values({
      orgId: e.orgId,
      actorUserId: e.actorUserId,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      metadata: e.metadata ?? {},
      ip: e.ip ?? null,
    });
  }

  async list(orgId: string, opts: { limit: number; before?: number }): Promise<AuditEntryDto[]> {
    return this.db.tenant(orgId, async (tx) => {
      const rows = await tx
        .select({ a: auditLog, actorName: users.name })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .where(and(eq(auditLog.orgId, orgId), opts.before ? lt(auditLog.id, opts.before) : undefined))
        .orderBy(desc(auditLog.id))
        .limit(opts.limit);
      return rows.map(({ a, actorName }) => ({
        id: String(a.id),
        action: a.action,
        actor: a.actorUserId ? { id: a.actorUserId, name: actorName ?? '' } : null,
        targetType: a.targetType,
        targetId: a.targetId,
        metadata: a.metadata,
        at: a.at.toISOString(),
      }));
    });
  }
}
