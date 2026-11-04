import { timingSafeEqual } from 'node:crypto';
import { Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from '../config/env';
import { NotFound, Unauthorized } from '../common/errors';
import { Public, SkipGlobalRateLimit } from '../common/decorators';
import { TraccarGateway } from '../gateway/traccar.gateway';
import { PositionsService } from './positions.service';

export const INGEST_SECRET_HEADER = 'x-ingest-secret';

/**
 * Receives forwarded positions from the device gateway (Traccar's position forwarding,
 * or the simulator speaking the same format). Not for browsers: authenticated by a shared
 * secret and meant to be reachable only on the internal network. Disabled when
 * INGEST_SECRET is unset.
 */
@Controller('ingest')
export class IngestController {
  private readonly gateway = new TraccarGateway();

  constructor(
    private readonly positions: PositionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @SkipGlobalRateLimit()
  @HttpCode(200)
  @Post('traccar')
  async traccar(@Req() req: FastifyRequest) {
    const secret = this.env.INGEST_SECRET;
    if (!secret) throw NotFound();
    const given = req.headers[INGEST_SECRET_HEADER];
    if (typeof given !== 'string' || !safeEqual(given, secret)) throw Unauthorized();
    return this.positions.ingest(this.gateway.normalize(req.body));
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
