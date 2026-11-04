import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/client';
import { CLOCK, DB, type Clock } from '../common/tokens';

/** Deletes location history older than each organization's retention setting. Runs hourly. */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Retention');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run().catch((e) => this.logger.error(e)), 60 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(): Promise<number> {
    const now = this.clock.now().toISOString();
    const res = (await this.db.system.execute(sql`
      with deleted as (
        delete from positions p using organizations o
        where p.org_id = o.id
          and p.recorded_at < ${now}::timestamptz - make_interval(days => o.location_retention_days)
        returning 1)
      select count(*)::int as n from deleted`)) as unknown as { rows: { n: number }[] };
    const n = res.rows[0]?.n ?? 0;
    if (n) this.logger.log(`Deleted ${n} positions past retention`);
    return n;
  }
}
