import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/client';
import { refreshTokens } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { Unauthorized } from '../common/errors';
import { newOpaqueToken, sha256 } from './crypto';

export interface AccessClaims {
  sub: string;
  /** users.password_changed_at (ms) when the token was issued; a password change invalidates it. */
  pwv: number;
}

@Injectable()
export class TokensService {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async signAccess(user: { id: string; passwordChangedAt: Date }): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({ pwv: user.passwordChangedAt.getTime() })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + this.env.ACCESS_TOKEN_TTL_SECONDS)
      .setIssuer('winou-api')
      .setAudience('winou')
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: 'winou-api',
        audience: 'winou',
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload.pwv !== 'number') throw new Error('claims');
      return { sub: payload.sub, pwv: payload.pwv };
    } catch {
      throw Unauthorized();
    }
  }

  async issueRefresh(userId: string, userAgent?: string, familyId: string = randomUUID()) {
    const { token, hash } = newOpaqueToken();
    const expiresAt = new Date(this.clock.now().getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const [row] = await this.db.system
      .insert(refreshTokens)
      .values({ userId, familyId, tokenHash: hash, expiresAt, userAgent: userAgent?.slice(0, 200) ?? null })
      .returning({ id: refreshTokens.id });
    return { token, id: row!.id, expiresAt };
  }

  /**
   * Rotates a refresh token. Reusing an already-rotated token revokes the whole family
   * (the token was probably stolen).
   */
  async rotate(token: string, userAgent?: string): Promise<{ userId: string; token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const [row] = await this.db.system
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)))
      .limit(1);
    if (!row) throw Unauthorized();
    if (row.revokedAt) {
      if (row.replacedBy) await this.revokeFamily(row.familyId);
      throw Unauthorized();
    }
    if (row.expiresAt <= now) throw Unauthorized();

    const next = await this.issueRefresh(row.userId, userAgent, row.familyId);
    const updated = await this.db.system
      .update(refreshTokens)
      .set({ revokedAt: now, replacedBy: next.id })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    if (updated.length === 0) {
      // Lost a race with a concurrent rotation: treat as reuse.
      await this.revokeFamily(row.familyId);
      throw Unauthorized();
    }
    return { userId: row.userId, token: next.token, expiresAt: next.expiresAt };
  }

  async revoke(token: string) {
    const [row] = await this.db.system
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(token)))
      .limit(1);
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeFamily(familyId: string) {
    await this.db.system
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string) {
    await this.db.system
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
