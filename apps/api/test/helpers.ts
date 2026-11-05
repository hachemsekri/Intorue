import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { MeDto } from '@winou/shared';
import { imeiWithCheckDigit } from '@winou/shared';
import { createApp, type AppDeps } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDatabase } from '../src/db/client';
import { MemoryMailer } from '../src/mail/mailer';
import { MemoryPushSender } from '../src/push/push.service';

export const PASSWORD = 'CorrectHorse42';

export class FakeClock {
  t = new Date('2026-11-04T09:00:00Z');
  now() {
    return new Date(this.t);
  }
  advance(ms: number) {
    this.t = new Date(this.t.getTime() + ms);
  }
  /** Moves time forward for `fn` only, so tokens issued earlier stay valid for later tests. */
  async travel<T>(ms: number, fn: () => Promise<T>): Promise<T> {
    const saved = this.t;
    this.advance(ms);
    try {
      return await fn();
    } finally {
      this.t = saved;
    }
  }
}

export interface TestCtx {
  app: NestFastifyApplication;
  deps: AppDeps;
  mailer: MemoryMailer;
  clock: FakeClock;
  push: MemoryPushSender;
  close(): Promise<void>;
}

export async function makeApp(envOverrides: Record<string, string> = {}): Promise<TestCtx> {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'pglite:memory',
    JWT_SECRET: 'test-secret-test-secret-test-secret-0123',
    RATE_LIMIT_AUTH_PER_MIN: '10000',
    RATE_LIMIT_GLOBAL_PER_MIN: '100000',
    // Independent of the developer's local .env.
    INGEST_SECRET: '',
    SMTP_URL: '',
    ...envOverrides,
  });
  const mailer = new MemoryMailer();
  const clock = new FakeClock();
  // Real clock for JWT/cookie handling would make expiry tests slow; the fake clock drives everything.
  const db = await createDatabase(env.DATABASE_URL);
  const push = new MemoryPushSender();
  const { app, deps } = await createApp({ env, db, mailer, clock, push });
  return { app, deps, mailer, clock, push, close: () => app.close().then(() => db.close()) };
}

export interface Client {
  token: string;
  me: MeDto;
  orgId: string;
  email: string;
}

let seq = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}.${Date.now()}.${++seq}@example.test`;
export const newImei = () => imeiWithCheckDigit(String(86000000000000 + ++seq * 7919).slice(0, 14).padStart(14, '8'));

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function call(
  t: TestCtx,
  method: Method,
  url: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; cookies?: Record<string, string> } = {},
) {
  const res = await t.app.inject({
    method,
    url: `/api${url}`,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    cookies: opts.cookies,
    payload: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: any;
  try {
    json = res.json();
  } catch {
    json = undefined;
  }
  return { status: res.statusCode, body: json, res };
}

export async function signup(
  t: TestCtx,
  opts: { email?: string; kind?: 'personal' | 'business'; orgName?: string; invitationToken?: string; name?: string } = {},
): Promise<Client> {
  const email = opts.email ?? uniqueEmail();
  const r = await call(t, 'POST', '/auth/signup', {
    body: {
      email,
      password: PASSWORD,
      name: opts.name ?? 'Test User',
      accountKind: opts.kind ?? 'business',
      orgName: opts.kind === 'personal' ? undefined : (opts.orgName ?? 'Org Test'),
      invitationToken: opts.invitationToken,
      acceptTerms: true,
    },
  });
  if (r.status !== 201) throw new Error(`signup failed ${r.status} ${JSON.stringify(r.body)}`);
  return login(t, email);
}

export async function login(t: TestCtx, email: string, password = PASSWORD): Promise<Client> {
  const r = await call(t, 'POST', '/auth/login', { body: { email, password, client: 'mobile' } });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  const me = (await call(t, 'GET', '/auth/me', { token: r.body.accessToken })).body as MeDto;
  return { token: r.body.accessToken, me, orgId: me.memberships[0]?.orgId ?? '', email };
}

/** Adds a member with a role to `owner`'s org through the real invitation flow. */
export async function addMember(t: TestCtx, owner: Client, role: 'owner' | 'manager' | 'viewer'): Promise<Client> {
  const email = uniqueEmail(role);
  const inv = await call(t, 'POST', `/orgs/${owner.orgId}/invitations`, { token: owner.token, body: { email, role } });
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = invitationToken(t, email);
  const c = await signup(t, { email, invitationToken: token });
  return { ...c, orgId: owner.orgId };
}

export function invitationToken(t: TestCtx, email: string): string {
  const m = t.mailer.last(email);
  const match = m?.text.match(/token=([\w%-]+)/);
  if (!match) throw new Error(`no invitation email for ${email}`);
  return decodeURIComponent(match[1]!);
}

export async function createVehicle(t: TestCtx, c: Client, plate = randomPlate(), extra: Record<string, unknown> = {}) {
  const r = await call(t, 'POST', `/orgs/${c.orgId}/vehicles`, {
    token: c.token,
    body: { type: 'car', name: 'Renault Clio', plate, ...extra },
  });
  if (r.status !== 201) throw new Error(`vehicle failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export async function createDevice(t: TestCtx, c: Client, imei = newImei()) {
  const r = await call(t, 'POST', `/orgs/${c.orgId}/devices`, { token: c.token, body: { imei } });
  if (r.status !== 201) throw new Error(`device failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

export const randomPlate = () => `${(++seq % 250) + 1} TUN ${seq % 10000}`;

export function cookiesFrom(res: { cookies: { name: string; value: string }[] }): Record<string, string> {
  return Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
}
