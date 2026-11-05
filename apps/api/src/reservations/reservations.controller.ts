import { Controller, HttpCode, Inject, Injectable, Post, Res } from '@nestjs/common';
import { LOCALES, normalizePhone, RESERVATION_VEHICLES } from '@winou/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { ClientIp, Public, RateLimit, ZBody } from '../common/decorators';
import { AppError } from '../common/errors';
import { RateLimiter } from '../common/rate-limit';
import { CLOCK, DB, type Clock } from '../common/tokens';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/client';
import { reservations } from '../db/schema';

/** Removes control and invisible formatting characters, and collapses spaces. */
const clean = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();

export const reservationSchema = z
  .object({
    name: z
      .string()
      .max(200, 'reservation.name')
      .transform(clean)
      .refine((v) => v.length >= 1 && v.length <= 100 && /\p{L}/u.test(v), 'reservation.name'),
    phone: z
      .string()
      .max(30, 'reservation.phone')
      .transform((v, ctx) => {
        const p = normalizePhone(v);
        if (!p) {
          ctx.addIssue({ code: 'custom', message: 'reservation.phone' });
          return z.NEVER;
        }
        return p;
      }),
    vehicleType: z.enum(RESERVATION_VEHICLES, { message: 'reservation.vehicle' }),
    city: z
      .string()
      .max(160, 'reservation.city')
      .optional()
      .transform((v) => (v ? clean(v) : ''))
      .refine((v) => v.length <= 80, 'reservation.city'),
    locale: z.enum(LOCALES).default('fr'),
    /** Honeypot: a field hidden from people. Anything in it means a bot filled the form. */
    website: z.string().max(200).optional(),
    /** Milliseconds between the form appearing and being sent. */
    elapsedMs: z.number().int().min(0).max(86_400_000),
  })
  .strict();
type ReservationInput = z.infer<typeof reservationSchema>;

const DUPLICATE_WINDOW_MS = 24 * 3600_000;

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  /** Returns whether a new row was written (false = the same phone already reserved in the last 24 h). */
  async create(input: ReservationInput, ip: string): Promise<{ id: string; created: boolean }> {
    if (input.website) throw new AppError(400, 'reservation.rejected');
    if (input.elapsedMs < this.env.RESERVATION_MIN_FILL_MS) throw new AppError(400, 'reservation.too_fast');
    if (!this.limiter.hit(`reservations:${ip}`, this.env.RESERVATIONS_PER_HOUR, 3600_000, this.clock.now().getTime())) {
      throw new AppError(429, 'rate_limited');
    }
    const now = this.clock.now();
    return this.db.system.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(eq(reservations.phone, input.phone), gt(reservations.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS))))
        .limit(1);
      if (existing) return { id: existing.id, created: false };
      const [row] = await tx
        .insert(reservations)
        .values({ name: input.name, phone: input.phone, vehicleType: input.vehicleType, city: input.city || null, locale: input.locale, createdAt: now })
        .returning({ id: reservations.id });
      // No personal data in the audit log: the reservation id and vehicle type only.
      await this.audit.record(tx, {
        orgId: null,
        actorUserId: null,
        action: 'reservation.created',
        targetType: 'reservation',
        targetId: row!.id,
        metadata: { vehicleType: input.vehicleType },
      });
      return { id: row!.id, created: true };
    });
  }
}

@Controller('public/reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  /**
   * Home page form: a request to be called back about a tracker. No payment, no account.
   * 201 = saved; 200 = this phone already reserved in the last 24 hours (still saved, nothing new written).
   */
  @Public()
  @RateLimit('public')
  @HttpCode(201)
  @Post()
  async create(
    @ZBody(reservationSchema) body: ReservationInput,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const r = await this.service.create(body, ip);
    if (!r.created) void reply.status(200);
    return { saved: true, duplicate: !r.created };
  }
}
