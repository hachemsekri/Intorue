import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  /**
   * postgres://… for a real server (Docker), or pglite:<dir> / pglite:memory for the
   * embedded engine used by tests and by local runs without Docker.
   */
  DATABASE_URL: z.string().min(1).default('pglite:./.data/pglite'),
  /** Pool size. Use 1 with the local PGlite server (it runs one query at a time). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Intorue <no-reply@localhost>'),
  COOKIE_SECURE: bool.optional(),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default('false'),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().positive().default(300),
  /** Shared secret for POST /api/ingest/traccar (Traccar forwarding and the simulator). Unset = ingest disabled. */
  INGEST_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(24, 'INGEST_SECRET must be at least 24 characters').optional()),
  /** none = off, console = log only (development), expo = Expo Push Service (needs your approval and an Expo project). */
  PUSH_PROVIDER: z.enum(['none', 'console', 'expo']).default('console'),
  EXPO_ACCESS_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  /** Home page reservations: per-IP limit per hour, and the minimum time a person takes to fill the form. */
  RESERVATIONS_PER_HOUR: z.coerce.number().int().positive().default(5),
  RESERVATION_MIN_FILL_MS: z.coerce.number().int().min(0).default(1500),
});

export type Env = z.infer<typeof EnvSchema> & { cookieSecure: boolean };

/** Loads the repo-root .env (if present) then validates. Fails fast on bad config. */
export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}\nSee .env.example`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.DATABASE_URL.startsWith('pglite:')) {
    throw new Error('PGlite is for development and tests only. Set DATABASE_URL to a PostgreSQL server.');
  }
  return { ...env, cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production' };
}

export const ENV = Symbol('ENV');
