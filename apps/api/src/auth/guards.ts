import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@winou/shared';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { memberships, users } from '../db/schema';
import { DB } from '../common/tokens';
import { AppError, Forbidden, NotFound, Unauthorized } from '../common/errors';
import { IS_PUBLIC, PERMISSION, isUuid, type AppRequest } from '../common/decorators';
import { TokensService } from './tokens.service';

export const ACCESS_COOKIE = 'winou_at';
export const REFRESH_COOKIE = 'winou_rt';
export const SESSION_MARKER_COOKIE = 'winou_session';
export const CSRF_HEADER = 'x-winou-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: every route requires a valid access token unless marked @Public().
 * Accepts `Authorization: Bearer` (mobile) or the httpOnly cookie (web).
 * Cookie-authenticated state-changing requests must carry the CSRF header.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    req.ctx ??= {};
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const header = req.headers.authorization;
    let token: string | undefined;
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7);
      req.ctx.authVia = 'bearer';
    } else if (req.cookies?.[ACCESS_COOKIE]) {
      token = req.cookies[ACCESS_COOKIE];
      req.ctx.authVia = 'cookie';
      if (!SAFE_METHODS.has(req.method) && !req.headers[CSRF_HEADER]) throw new AppError(403, 'csrf');
    }
    if (!token) throw Unauthorized();

    const claims = await this.tokens.verifyAccess(token);
    const [user] = await this.db.system.select().from(users).where(eq(users.id, claims.sub)).limit(1);
    if (!user || user.disabledAt) throw Unauthorized();
    // Tokens issued before a password change are no longer valid.
    if (claims.pwv !== user.passwordChangedAt.getTime()) throw Unauthorized();

    req.ctx.user = { id: user.id, email: user.email, name: user.name };
    return true;
  }
}

/**
 * Global guard for routes with an :orgId param: the user must be a member (else 404, so
 * the existence of other organizations is never revealed) and their role must grant the
 * route's @RequirePermission (else 403). Fails closed if a route forgets the decorator.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const params = (req.params ?? {}) as Record<string, string>;
    if (!('orgId' in params)) return true;

    const permission = this.reflector.get<Permission | undefined>(PERMISSION, ctx.getHandler());
    if (!permission) throw new Error(`Route ${req.method} ${req.routeOptions?.url} has :orgId but no @RequirePermission`);
    const user = req.ctx?.user;
    if (!user) throw Unauthorized();
    if (!isUuid(params.orgId)) throw NotFound();

    const orgId = params.orgId.toLowerCase();
    const [m] = await this.db.system
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, user.id)))
      .limit(1);
    if (!m) throw NotFound();
    if (!can(m.role, permission)) throw Forbidden();
    req.ctx.org = { id: orgId, role: m.role };
    return true;
  }
}
