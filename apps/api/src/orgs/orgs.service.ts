import { Inject, Injectable } from '@nestjs/common';
import { brand } from '@winou/config';
import type { InvitationDto, MemberDto, OrgDto, Role } from '@winou/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/client';
import { invitations, memberships, organizations, users } from '../db/schema';
import { CLOCK, DB, MAILER, type Clock } from '../common/tokens';
import { BadRequest, Conflict, NotFound } from '../common/errors';
import type { Mailer } from '../mail/mailer';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { newOpaqueToken } from '../auth/crypto';

const INVITATION_TTL_MS = 7 * 86_400_000;

interface Actor {
  userId: string;
  ip?: string;
}

const toOrgDto = (o: typeof organizations.$inferSelect): OrgDto => ({
  id: o.id,
  name: o.name,
  kind: o.kind,
  timezone: o.timezone,
  locationRetentionDays: o.locationRetentionDays,
  createdAt: o.createdAt.toISOString(),
});

@Injectable()
export class OrgsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async create(name: string, actor: Actor): Promise<OrgDto> {
    return this.db.system.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name, kind: 'business', timezone: 'Africa/Tunis', locationRetentionDays: 90, isDemo: false })
        .returning();
      await tx.insert(memberships).values({ orgId: org!.id, userId: actor.userId, role: 'owner' });
      await this.audit.record(tx, {
        orgId: org!.id,
        actorUserId: actor.userId,
        action: 'org.created',
        targetType: 'organization',
        targetId: org!.id,
        metadata: { kind: 'business' },
        ip: actor.ip,
      });
      return toOrgDto(org!);
    });
  }

  get(orgId: string): Promise<OrgDto> {
    return this.db.tenant(orgId, async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      if (!org) throw NotFound();
      return toOrgDto(org);
    });
  }

  update(orgId: string, patch: { name?: string; locationRetentionDays?: number }, actor: Actor): Promise<OrgDto> {
    return this.db.tenant(orgId, async (tx) => {
      const [org] = await tx.update(organizations).set(patch).where(eq(organizations.id, orgId)).returning();
      if (!org) throw NotFound();
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'org.updated',
        targetType: 'organization',
        targetId: orgId,
        metadata: patch,
        ip: actor.ip,
      });
      return toOrgDto(org);
    });
  }

  // ---------- Members ----------

  listMembers(orgId: string): Promise<MemberDto[]> {
    return this.db.tenant(orgId, async (tx) => {
      const rows = await tx
        .select({ m: memberships, u: users })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, orgId))
        .orderBy(memberships.createdAt);
      return rows.map(({ m, u }) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      }));
    });
  }

  updateMemberRole(orgId: string, userId: string, role: Role, actor: Actor): Promise<void> {
    return this.db.tenant(orgId, async (tx) => {
      const all = await tx.select().from(memberships).where(eq(memberships.orgId, orgId)).for('update');
      const target = all.find((m) => m.userId === userId);
      if (!target) throw NotFound();
      if (target.role === role) return;
      if (target.role === 'owner' && all.filter((m) => m.role === 'owner').length === 1) throw Conflict('last_owner');
      await tx
        .update(memberships)
        .set({ role })
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'member.role_changed',
        targetType: 'user',
        targetId: userId,
        metadata: { from: target.role, to: role },
        ip: actor.ip,
      });
    });
  }

  removeMember(orgId: string, userId: string, actor: Actor): Promise<void> {
    return this.db.tenant(orgId, async (tx) => {
      const all = await tx.select().from(memberships).where(eq(memberships.orgId, orgId)).for('update');
      const target = all.find((m) => m.userId === userId);
      if (!target) throw NotFound();
      if (target.role === 'owner' && all.filter((m) => m.role === 'owner').length === 1) throw Conflict('last_owner');
      await tx.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'member.removed',
        targetType: 'user',
        targetId: userId,
        metadata: { role: target.role },
        ip: actor.ip,
      });
    });
  }

  // ---------- Invitations ----------

  listInvitations(orgId: string): Promise<InvitationDto[]> {
    return this.db.tenant(orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.orgId, orgId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, this.clock.now()),
          ),
        )
        .orderBy(invitations.createdAt);
      return rows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      }));
    });
  }

  async invite(orgId: string, email: string, role: Role, actor: Actor): Promise<InvitationDto> {
    const { token, hash } = newOpaqueToken();
    const expiresAt = new Date(this.clock.now().getTime() + INVITATION_TTL_MS);
    const { inv, orgName } = await this.db.tenant(orgId, async (tx) => {
      const already = await tx
        .select({ id: users.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.orgId, orgId), eq(users.email, email)))
        .limit(1);
      if (already.length) throw Conflict('invitation.already_member');
      const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
      const [row] = await tx
        .insert(invitations)
        .values({ orgId, email, role, tokenHash: hash, invitedBy: actor.userId, expiresAt })
        .returning();
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'member.invited',
        targetType: 'invitation',
        targetId: row!.id,
        metadata: { email, role },
        ip: actor.ip,
      });
      return { inv: row!, orgName: org!.name };
    });
    const link = `${this.env.WEB_URL}/invitation?token=${encodeURIComponent(token)}`;
    await this.mailer.send({
      to: email,
      subject: `${brand.name} : invitation à rejoindre ${orgName}`,
      text: `Bonjour,\n\nVous êtes invité à rejoindre « ${orgName} » sur ${brand.name}.\nOuvrez ce lien (valable 7 jours) :\n${link}\n\n${brand.name}`,
    });
    return {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    };
  }

  revokeInvitation(orgId: string, invitationId: string, actor: Actor): Promise<void> {
    return this.db.tenant(orgId, async (tx) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: this.clock.now() })
        .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning({ id: invitations.id });
      if (!row) throw NotFound();
      await this.audit.record(tx, {
        orgId,
        actorUserId: actor.userId,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: invitationId,
        ip: actor.ip,
      });
    });
  }

  /** Signed-in user accepts an invitation addressed to their email. */
  async acceptInvitation(token: string, user: { id: string; email: string }, ip?: string): Promise<OrgDto> {
    const inv = await this.auth.findValidInvitation(this.db.system, token);
    if (inv.email !== user.email) throw BadRequest('invitation.email_mismatch');
    return this.db.system.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.orgId, inv.orgId), eq(memberships.userId, user.id)));
      if (existing.length) throw Conflict('invitation.already_member');
      await tx.insert(memberships).values({ orgId: inv.orgId, userId: user.id, role: inv.role });
      await tx.update(invitations).set({ acceptedAt: this.clock.now() }).where(eq(invitations.id, inv.id));
      await this.audit.record(tx, {
        orgId: inv.orgId,
        actorUserId: user.id,
        action: 'invitation.accepted',
        targetType: 'user',
        targetId: user.id,
        metadata: { role: inv.role },
        ip,
      });
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, inv.orgId));
      return toOrgDto(org!);
    });
  }
}
