import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ENV, type Env } from '../config/env';
import { AppError } from './errors';
import { RATE_LIMIT, SKIP_GLOBAL_RATE_LIMIT, type RateLimitBucket } from './decorators';

/**
 * Fixed-window counters in memory.
 * TODO(prod): move to Redis so limits hold across several API instances.
 */
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  /** Returns true if the hit is allowed. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      if (this.windows.size > 50_000) this.sweep(now);
      return true;
    }
    w.count++;
    return w.count <= limit;
  }

  count(key: string, now = Date.now()): number {
    const w = this.windows.get(key);
    return w && w.resetAt > now ? w.count : 0;
  }

  reset(key: string) {
    this.windows.delete(key);
  }

  private sweep(now: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const reply = ctx.switchToHttp().getResponse<FastifyReply>();
    const ip = req.ip;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_GLOBAL_RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    if (!skip && !this.limiter.hit(`global:${ip}`, this.env.RATE_LIMIT_GLOBAL_PER_MIN, 60_000)) {
      void reply.header('retry-after', '60');
      throw new AppError(429, 'rate_limited');
    }
    const bucket = this.reflector.getAllAndOverride<RateLimitBucket | undefined>(RATE_LIMIT, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (bucket) {
      const limit = this.env.RATE_LIMIT_AUTH_PER_MIN;
      const route = req.routeOptions?.url ?? req.url;
      if (!this.limiter.hit(`${bucket}:${route}:${ip}`, limit, 60_000)) {
        void reply.header('retry-after', '60');
        throw new AppError(429, 'rate_limited');
      }
    }
    return true;
  }
}
