import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, type TestCtx } from './helpers';

let t: TestCtx;
let n = 0;
/** A different client IP per test, so the hourly limit of one test does not leak into the next. */
const ip = () => `10.0.0.${++n}`;
const valid = (over: Record<string, unknown> = {}) => ({
  name: 'Amira Ben Salah',
  phone: `22 ${String(100000 + n * 37).slice(0, 3)} ${String(100 + n).padStart(3, '0')}`,
  vehicleType: 'car',
  city: 'Tunis',
  locale: 'fr',
  website: '',
  elapsedMs: 8000,
  ...over,
});
const post = (body: unknown, from = ip()) => call(t, 'POST', '/public/reservations', { body, headers: { 'x-forwarded-for': from } , });
const rows = async () =>
  ((await t.deps.db.system.execute(sql`select name, phone, vehicle_type, city, locale, status from reservations order by created_at`)) as unknown as { rows: any[] }).rows;

beforeAll(async () => {
  t = await makeApp({ RESERVATIONS_PER_HOUR: '3', TRUST_PROXY: 'true' });
});
afterAll(() => t.close());

describe('reservations', () => {
  it('saves a valid reservation without signing in, with a normalized phone', async () => {
    const before = (await rows()).length;
    const r = await post(valid({ phone: '+216 98.765.432', city: '  Sfax  ' }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ saved: true, duplicate: false });
    const all = await rows();
    expect(all.length).toBe(before + 1);
    expect(all.at(-1)).toMatchObject({ name: 'Amira Ben Salah', phone: '+21698765432', vehicle_type: 'car', city: 'Sfax', status: 'new' });
  });

  it('writes an audit entry without personal data', async () => {
    const res = (await t.deps.db.system.execute(
      sql`select metadata, ip from audit_log where action = 'reservation.created' order by id desc limit 1`,
    )) as unknown as { rows: { metadata: Record<string, unknown>; ip: string | null }[] };
    expect(res.rows[0]!.metadata).toEqual({ vehicleType: 'car' });
    expect(JSON.stringify(res.rows[0])).not.toContain('98765432');
  });

  it('does not store the same phone twice within a day, but says it is saved', async () => {
    const body = valid({ phone: '50 111 222' });
    expect((await post(body)).status).toBe(201);
    const before = (await rows()).length;
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ saved: true, duplicate: true });
    expect((await rows()).length).toBe(before);
  });

  it('rejects invalid fields with codes the page can translate', async () => {
    const r = await post(valid({ name: '  ', phone: '123', vehicleType: 'truck', city: 'x'.repeat(90) }));
    expect(r.status).toBe(400);
    const paths = Object.fromEntries((r.body.issues as { path: string; code: string }[]).map((i) => [i.path, i.code]));
    expect(paths).toMatchObject({ name: 'reservation.name', phone: 'reservation.phone', vehicleType: 'reservation.vehicle', city: 'reservation.city' });
  });

  it('rejects unknown fields (no payment or other data accepted)', async () => {
    const r = await post({ ...valid(), card: '4242' });
    expect(r.status).toBe(400);
  });

  it('rejects the honeypot and forms sent too fast, and stores nothing', async () => {
    const before = (await rows()).length;
    const bot = await post(valid({ website: 'http://spam.example' }));
    expect(bot.status).toBe(400);
    expect(bot.body.code).toBe('reservation.rejected');
    const fast = await post(valid({ elapsedMs: 200 }));
    expect(fast.status).toBe(400);
    expect(fast.body.code).toBe('reservation.too_fast');
    expect((await rows()).length).toBe(before);
  });

  it('limits reservations per connection per hour', async () => {
    const from = ip();
    for (let i = 0; i < 3; i++) expect((await post(valid({ phone: `9${i}123456` }), from)).status).toBe(201);
    const r = await post(valid({ phone: '97123456' }), from);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('rate_limited');
    t.clock.advance(3600_000 + 1);
    expect((await post(valid({ phone: '98123456' }), from)).status).toBe(201);
  });

  it('is not readable by the application role', async () => {
    await expect(
      t.deps.db.system.transaction(async (tx) => {
        await tx.execute(sql`set local role winou_app`);
        await tx.execute(sql`select * from reservations`);
      }),
    ).rejects.toThrow();
  });
});
