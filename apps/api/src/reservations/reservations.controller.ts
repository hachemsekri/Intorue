import { Controller, HttpCode, Inject, Injectable, Post, Res } from '@nestjs/common';
import { PRICING, quoteFor, type Quote } from '@winou/config';
import { LOCALES, normalizePhone } from '@winou/shared';
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
const count = z.number({ message: 'reservation.vehicles' }).int('reservation.vehicles').min(0, 'reservation.vehicles').max(PRICING.maxPerKind, 'reservation.vehicles');

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
    clientType: z.enum(['individual', 'company'], { message: 'reservation.clientType' }),
    company: z
      .string()
      .max(240, 'reservation.company')
      .optional()
      .transform((v) => (v ? clean(v) : ''))
      .refine((v) => v.length <= 120, 'reservation.company'),
    /** Counts only: prices and totals always come from the server's own price list. */
    vehicles: z.object({ car: count, moto: count, trot: count }, { message: 'reservation.vehicles' }).strict(),
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
  .strict()
  .superRefine((v, ctx) => {
    if (v.vehicles.car + v.vehicles.moto + v.vehicles.trot < 1) ctx.addIssue({ code: 'custom', path: ['vehicles'], message: 'reservation.vehicles' });
    if (v.clientType === 'company' && !v.company) ctx.addIssue({ code: 'custom', path: ['company'], message: 'reservation.company' });
  });
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

  /**
   * Saves the request with a total calculated here. The same phone within 24 hours updates its
   * existing request instead of adding another, so the latest vehicle counts are what we call about.
   */
  async create(input: ReservationInput, ip: string): Promise<{ id: string; created: boolean; quote: Quote }> {
    if (input.website) throw new AppError(400, 'reservation.rejected');
    if (input.elapsedMs < this.env.RESERVATION_MIN_FILL_MS) throw new AppError(400, 'reservation.too_fast');
    if (!this.limiter.hit(`reservations:${ip}`, this.env.RESERVATIONS_PER_HOUR, 3600_000, this.clock.now().getTime())) {
      throw new AppError(429, 'rate_limited');
    }
    const now = this.clock.now();
    const quote = quoteFor(input.vehicles);
    const values = {
      name: input.name,
      city: input.city || null,
      locale: input.locale,
      clientType: input.clientType,
      company: input.clientType === 'company' ? input.company : null,
      qtyCar: input.vehicles.car,
      qtyMoto: input.vehicles.moto,
      qtyTrot: input.vehicles.trot,
      totalDt: quote.total,
      savedDt: quote.saved,
    };
    return this.db.system.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(eq(reservations.phone, input.phone), gt(reservations.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS))))
        .limit(1);
      if (existing) {
        await tx.update(reservations).set({ ...values, updatedAt: now }).where(eq(reservations.id, existing.id));
        return { id: existing.id, created: false, quote };
      }
      const [row] = await tx.insert(reservations).values({ ...values, phone: input.phone, createdAt: now }).returning({ id: reservations.id });
      // No personal data in the audit log.
      await this.audit.record(tx, {
        orgId: null,
        actorUserId: null,
        action: 'reservation.created',
        targetType: 'reservation',
        targetId: row!.id,
        metadata: { vehicles: quote.vehicles, totalDt: quote.total },
      });
      return { id: row!.id, created: true, quote };
    });
  }
}

@Controller('public/reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  /**
   * Home page form: a request to be called back with a quote. No payment, no account.
   * 201 = saved; 200 = this phone's request from the last 24 hours was updated.
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
    return { saved: true, duplicate: !r.created, total: r.quote.total, saved_dt: r.quote.saved };
  }
}
