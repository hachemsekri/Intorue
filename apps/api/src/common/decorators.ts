import { createParamDecorator, ExecutionContext, NotFoundException, SetMetadata } from '@nestjs/common';
import type { Permission, Role } from '@winou/shared';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeAny, z } from 'zod';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}
export interface OrgContext {
  id: string;
  role: Role;
}
export interface RequestCtx {
  user?: AuthUser;
  org?: OrgContext;
  authVia?: 'cookie' | 'bearer';
}
export type AppRequest = FastifyRequest & { ctx: RequestCtx };

export const IS_PUBLIC = 'winou:public';
/** Route needs no signed-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION = 'winou:permission';
/** Required on every route that has an :orgId param. The OrgGuard fails closed without it. */
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION, p);

export const RATE_LIMIT = 'winou:rate-limit';
export type RateLimitBucket = 'auth' | 'public';
/** Stricter per-IP limit on top of the global one. */
export const RateLimit = (bucket: RateLimitBucket) => SetMetadata(RATE_LIMIT, bucket);

export const SKIP_GLOBAL_RATE_LIMIT = 'winou:skip-global-rate-limit';
/** For machine endpoints authenticated by a shared secret (device ingest), which send many requests. */
export const SkipGlobalRateLimit = () => SetMetadata(SKIP_GLOBAL_RATE_LIMIT, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.ctx?.user) throw new Error('CurrentUser used on a public route');
  return req.ctx.user;
});

export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.ctx?.org) throw new Error('CurrentOrg used on a route without :orgId');
  return req.ctx.org;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string =>
  ctx.switchToHttp().getRequest<FastifyRequest>().ip,
);

/** Parses and validates the body with a Zod schema. Unknown keys are rejected by .strict() schemas. */
export const ZBody = <S extends ZodTypeAny>(schema: S) =>
  createParamDecorator((_: unknown, ctx: ExecutionContext): z.infer<S> =>
    schema.parse(ctx.switchToHttp().getRequest<FastifyRequest>().body ?? {}),
  )();

export const ZQuery = <S extends ZodTypeAny>(schema: S) =>
  createParamDecorator((_: unknown, ctx: ExecutionContext): z.infer<S> =>
    schema.parse(ctx.switchToHttp().getRequest<FastifyRequest>().query ?? {}),
  )();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Route param that must be a UUID; anything else is a 404 (no hint about what exists). */
export const UuidParam = (name: string) =>
  createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
    const v = (ctx.switchToHttp().getRequest<FastifyRequest>().params as Record<string, string>)[name];
    if (!isUuid(v)) throw new NotFoundException();
    return v.toLowerCase();
  })();
