import 'reflect-metadata';
import { Controller, Get, Inject, Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { sql } from 'drizzle-orm';
import { loadEnv, ENV, type Env } from './config/env';
import { createDatabase, type Database } from './db/client';
import { migrate } from './db/migrate';
import { CLOCK, DB, MAILER, systemClock, type Clock } from './common/tokens';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { Public } from './common/decorators';
import { RateLimiter, RateLimitGuard } from './common/rate-limit';
import { ConsoleMailer, SmtpMailer, type Mailer } from './mail/mailer';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard, OrgGuard } from './auth/guards';
import { TokensService } from './auth/tokens.service';
import { InvitationsController, OrgsController } from './orgs/orgs.controller';
import { OrgsService } from './orgs/orgs.service';
import { DevicesController, VehiclesController } from './vehicles/fleet.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { DevicesService } from './devices/devices.service';

@Controller('health')
class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}
  @Public()
  @Get()
  async health() {
    await this.db.system.execute(sql`select 1`);
    return { status: 'ok' };
  }
}

export interface AppDeps {
  env: Env;
  db: Database;
  mailer: Mailer;
  clock: Clock;
}

@Module({})
class AppModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        OrgsController,
        InvitationsController,
        VehiclesController,
        DevicesController,
      ],
      providers: [
        { provide: ENV, useValue: deps.env },
        { provide: DB, useValue: deps.db },
        { provide: MAILER, useValue: deps.mailer },
        { provide: CLOCK, useValue: deps.clock },
        RateLimiter,
        TokensService,
        AuditService,
        AuthService,
        OrgsService,
        VehiclesService,
        DevicesService,
        // Order matters: rate limit, then authentication, then organization authorization.
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: OrgGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}

export async function createApp(
  partial: Partial<AppDeps> & { envOverrides?: Record<string, string> } = {},
): Promise<{ app: NestFastifyApplication; deps: AppDeps }> {
  const env = partial.env ?? loadEnv(partial.envOverrides);
  const db = partial.db ?? (await createDatabase(env.DATABASE_URL));
  await migrate(db);
  const mailer = partial.mailer ?? (env.SMTP_URL ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new ConsoleMailer());
  const deps: AppDeps = { env, db, mailer, clock: partial.clock ?? systemClock };

  const adapter = new FastifyAdapter({ trustProxy: env.TRUST_PROXY, bodyLimit: 256 * 1024 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(deps), adapter, {
    logger: env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api');
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, { origin: origins.length ? origins : false, credentials: true });
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, deps };
}
