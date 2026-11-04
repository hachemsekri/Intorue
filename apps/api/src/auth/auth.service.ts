import { Inject, Injectable } from '@nestjs/common';
import { brand } from '@winou/config';
import {
  permissionsFor,
  type MeDto,
  type SignupInput,
  type LoginInput,
  type MembershipDto,
} from '@winou/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import { isUniqueViolation, type Database } from '../db/client';
import { consents, invitations, memberships, organizations, passwordResetTokens, users } from '../db/schema';
import { CLOCK, DB, MAILER, type Clock } from '../common/tokens';
import { AppError, BadRequest, Conflict, Unauthorized } from '../common/errors';
import { RateLimiter } from '../common/rate-limit';
import type { Mailer } from '../mail/mailer';
import { AuditService } from '../audit/audit.service';
import { dummyVerify, hashPassword, newOpaqueToken, sha256, verifyPassword } from './crypto';
import { TokensService } from './tokens.service';

const RESET_TTL_MS = 30 * 60_000;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
/** Placeholder until legal texts exist (docs/LEGAL_REVIEW.md). */
export const TERMS_VERSION = 'placeholder-0';

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
  ) {}

  async signup(input: SignupInput, userAgent?: string, ip?: string): Promise<Session> {
    const passwordHash = await hashPassword(input.password);
    const now = this.clock.now();
    let userId: string;
    try {
      userId = await this.db.system.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, passwordHash, name: input.name, locale: input.locale })
          .returning({ id: users.id });
        const uid = user!.id;
        await tx.insert(consents).values([
          { userId: uid, documentKey: 'terms', version: TERMS_VERSION },
          { userId: uid, documentKey: 'privacy', version: TERMS_VERSION },
        ]);

        if (input.invitationToken) {
          const inv = await this.findValidInvitation(tx, input.invitationToken);
          if (inv.email !== input.email) throw BadRequest('invitation.email_mismatch');
          await tx.insert(memberships).values({ orgId: inv.orgId, userId: uid, role: inv.role });
          await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, inv.id));
          await this.audit.record(tx, {
            orgId: inv.orgId,
            actorUserId: uid,
            action: 'invitation.accepted',
            targetType: 'user',
            targetId: uid,
            metadata: { role: inv.role },
            ip,
          });
        } else {
          const kind = input.accountKind;
          const [org] = await tx
            .insert(organizations)
            .values({
              name: kind === 'business' ? input.orgName! : input.name,
              kind,
              timezone: 'Africa/Tunis',
              locationRetentionDays: 90,
              isDemo: false,
            })
            .returning({ id: organizations.id });
          await tx.insert(memberships).values({ orgId: org!.id, userId: uid, role: 'owner' });
          await this.audit.record(tx, {
            orgId: org!.id,
            actorUserId: uid,
            action: 'org.created',
            targetType: 'organization',
            targetId: org!.id,
            metadata: { kind },
            ip,
          });
        }
        return uid;
      });
    } catch (e) {
      if (isUniqueViolation(e, 'users_email_key')) throw Conflict('email_taken');
      throw e;
    }
    return this.startSession(userId, userAgent);
  }

  async login(input: LoginInput, userAgent?: string, ip?: string): Promise<Session> {
    const failKey = `loginfail:${input.email}`;
    if (this.limiter.count(failKey) >= this.env.LOGIN_MAX_FAILURES) throw new AppError(429, 'rate_limited');

    const [user] = await this.db.system.select().from(users).where(eq(users.email, input.email)).limit(1);
    const ok = user && !user.disabledAt ? await verifyPassword(user.passwordHash, input.password) : await dummyVerify(input.password);
    if (!ok || !user) {
      this.limiter.hit(failKey, this.env.LOGIN_MAX_FAILURES, LOGIN_FAILURE_WINDOW_MS);
      await this.audit.record(this.db.system, {
        orgId: null,
        actorUserId: user?.id ?? null,
        action: 'auth.login_failed',
        metadata: { email: input.email },
        ip,
      });
      throw new AppError(401, 'invalid_credentials');
    }
    this.limiter.reset(failKey);
    return this.startSession(user.id, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<Session> {
    const rotated = await this.tokens.rotate(refreshToken, userAgent);
    const [user] = await this.db.system.select().from(users).where(eq(users.id, rotated.userId));
    if (!user || user.disabledAt) throw Unauthorized();
    return {
      userId: rotated.userId,
      accessToken: await this.tokens.signAccess(user),
      refreshToken: rotated.token,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.tokens.revoke(refreshToken);
  }

  /** Always succeeds from the caller's point of view, so it never reveals whether an account exists. */
  async forgotPassword(email: string): Promise<void> {
    const [user] = await this.db.system.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.disabledAt) return;
    const { token, hash } = newOpaqueToken();
    await this.db.system.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(this.clock.now().getTime() + RESET_TTL_MS),
    });
    const link = `${this.env.WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mailer.send({
      to: user.email,
      subject: `${brand.name} : réinitialisation du mot de passe`,
      text: `Bonjour ${user.name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\n${brand.name}`,
    });
  }

  async resetPassword(token: string, password: string, ip?: string): Promise<void> {
    const now = this.clock.now();
    const passwordHash = await hashPassword(password);
    const userId = await this.db.system.transaction(async (tx) => {
      const [row] = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, sha256(token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });
      if (!row) throw BadRequest('reset.invalid');
      await tx.update(users).set({ passwordHash, passwordChangedAt: now }).where(eq(users.id, row.userId));
      await this.audit.record(tx, { orgId: null, actorUserId: row.userId, action: 'auth.password_reset', ip });
      return row.userId;
    });
    await this.tokens.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<MeDto> {
    const [user] = await this.db.system.select().from(users).where(eq(users.id, userId));
    if (!user) throw Unauthorized();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      memberships: await this.membershipsOf(userId),
    };
  }

  async membershipsOf(userId: string): Promise<MembershipDto[]> {
    const rows = await this.db.system
      .select({ m: memberships, o: organizations })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, userId))
      .orderBy(organizations.createdAt);
    return rows.map(({ m, o }) => ({
      orgId: o.id,
      orgName: o.name,
      orgKind: o.kind,
      role: m.role,
      permissions: permissionsFor(m.role),
    }));
  }

  async findValidInvitation(exec: Pick<Database['system'], 'select'>, token: string) {
    const [inv] = await exec
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, sha256(token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, this.clock.now()),
        ),
      )
      .limit(1);
    if (!inv) throw BadRequest('invitation.invalid');
    return inv;
  }

  private async startSession(userId: string, userAgent?: string): Promise<Session> {
    const [user] = await this.db.system.select().from(users).where(eq(users.id, userId));
    if (!user) throw Unauthorized();
    const refresh = await this.tokens.issueRefresh(userId, userAgent);
    return {
      userId,
      accessToken: await this.tokens.signAccess(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }
}
