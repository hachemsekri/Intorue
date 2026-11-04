import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { can, type LiveEvent } from '@winou/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import type { WebSocket } from 'ws';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/client';
import { memberships, users } from '../db/schema';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { EVENT_BUS, type EventBus } from './event-bus';

const TICKET_TTL_S = 60;
const AUTH_TIMEOUT_MS = 5_000;
const RECHECK_MS = 60_000;

/** Close codes (4000–4999 are application-defined). */
export const WS_CLOSE = { authTimeout: 4401, unauthorized: 4401, forbidden: 4403, badOrigin: 4403 } as const;

@Injectable()
export class LiveTickets {
  private readonly key: Uint8Array;
  /** Used ticket IDs until they expire: a ticket opens one socket only. */
  private readonly used = new Map<string, number>();

  constructor(
    @Inject(ENV) env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(env.JWT_SECRET);
  }

  async issue(userId: string, orgId: string) {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const ticket = await new SignJWT({ org: orgId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + TICKET_TTL_S)
      .setAudience('winou-live')
      .setIssuer('winou-api')
      .sign(this.key);
    return { ticket, expiresIn: TICKET_TTL_S };
  }

  async redeem(ticket: string): Promise<{ userId: string; orgId: string } | null> {
    try {
      const { payload } = await jwtVerify(ticket, this.key, {
        audience: 'winou-live',
        issuer: 'winou-api',
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload.org !== 'string' || typeof payload.jti !== 'string') return null;
      const nowMs = this.clock.now().getTime();
      for (const [k, exp] of this.used) if (exp < nowMs) this.used.delete(k);
      if (this.used.has(payload.jti)) return null;
      this.used.set(payload.jti, (payload.exp ?? 0) * 1000);
      return { userId: payload.sub, orgId: payload.org };
    } catch {
      return null;
    }
  }
}

/**
 * WebSocket protocol (path /api/live/ws):
 *   client → {"type":"auth","ticket":"…"}  (within 5 s, from POST /orgs/:orgId/live/ticket)
 *   server → {"type":"hello","orgId":"…"} then {"type":"vehicle","data":VehicleLiveDto} on every update
 * The socket only ever carries events of the ticket's organization. Membership is rechecked
 * every minute; a removed member is disconnected.
 */
@Injectable()
export class LiveSocketHandler {
  private readonly logger = new Logger('LiveSocket');
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly tickets: LiveTickets,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set(
      [env.WEB_URL, ...env.CORS_ORIGINS.split(',')].map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
    );
  }

  handle(socket: WebSocket, req: FastifyRequest) {
    // Browsers always send Origin; native mobile clients do not.
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.has(origin.replace(/\/$/, ''))) {
      socket.close(WS_CLOSE.badOrigin, 'origin');
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let recheck: NodeJS.Timeout | undefined;
    let authed = false;
    const send = (e: LiveEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(e));
    };
    const authTimer = setTimeout(() => socket.close(WS_CLOSE.authTimeout, 'auth_timeout'), AUTH_TIMEOUT_MS);

    socket.on('message', async (raw) => {
      if (authed) return; // clients send nothing after auth
      authed = true;
      clearTimeout(authTimer);
      let ticket: unknown;
      try {
        ticket = (JSON.parse(String(raw)) as { type?: string; ticket?: unknown }).ticket;
      } catch {
        /* handled below */
      }
      const claims = typeof ticket === 'string' ? await this.tickets.redeem(ticket) : null;
      if (!claims || !(await this.allowed(claims.userId, claims.orgId))) {
        send({ type: 'error', code: 'unauthorized' });
        socket.close(WS_CLOSE.unauthorized, 'unauthorized');
        return;
      }
      unsubscribe = this.bus.subscribe(claims.orgId, (e) => {
        // Defence in depth: the bus is already org-scoped.
        if (e.orgId === claims.orgId) send({ type: 'vehicle', data: e.vehicle });
      });
      recheck = setInterval(() => {
        void this.allowed(claims.userId, claims.orgId).then((ok) => {
          if (!ok) socket.close(WS_CLOSE.forbidden, 'membership');
        });
      }, RECHECK_MS);
      recheck.unref();
      send({ type: 'hello', orgId: claims.orgId });
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      clearInterval(recheck);
      unsubscribe?.();
    });
    socket.on('error', (e) => this.logger.warn(e.message));
  }

  private async allowed(userId: string, orgId: string): Promise<boolean> {
    const [row] = await this.db.system
      .select({ role: memberships.role, disabledAt: users.disabledAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
      .limit(1);
    return !!row && !row.disabledAt && can(row.role, 'vehicles.read');
  }
}
