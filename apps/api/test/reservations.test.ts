import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, makeApp, type TestCtx } from './helpers';

let t: TestCtx;
let n = 0;
/** A different client IP per test, so the hourly limit of one test does not leak into the next. */
const ip = () => `10.0.0.${++n}`;
let phoneSeq = 0;
const phone = () => `2${String(1000000 + ++phoneSeq).slice(0, 7)}`;
const valid = (over: Record<string, unknown> = {}) => ({
  name: 'Amira Ben Salah',
  phone: phone(),
  clientType: 'individual',
  vehicles: { car: 1, moto: 0, trot: 0 },
  city: 'Tunis',
  locale: 'fr',
  website: '',
  elapsedMs: 8000,
  ...over,
});
const post = (body: unknown, from = ip()) => call(t, 'POST', '/public/reservations', { body, headers: { 'x-forwarded-for': from } });
const rows = async () =>
  ((await t.deps.db.system.execute(sql`select name, phone, client_type, company, qty_car, qty_moto, qty_trot, total_dt, saved_dt, city, status from reservations order by created_at`)) as unknown as { rows: any[] }).rows;

beforeAll(async () => {
  t = await makeApp({ RESERVATIONS_PER_HOUR: '3', TRUST_PROXY: 'true' });
});
afterAll(() => t.close());

describe('quote requests', () => {
  it('saves a request without signing in, with a normalized phone and a server total', async () => {
    const r = await post(valid({ phone: '+216 98.765.432', city: '  Sfax  ', vehicles: { car: 1, moto: 2, trot: 0 } }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ saved: true, duplicate: false, total: 440, saved_dt: 0 });
    expect((await rows()).at(-1)).toMatchObject({ phone: '+21698765432', client_type: 'individual', qty_car: 1, qty_moto: 2, total_dt: 440, saved_dt: 0, city: 'Sfax', status: 'new' });
  });

  it('keeps normal prices at 10 vehicles and applies fleet prices at 11', async () => {
    const ten = await post(valid({ vehicles: { car: 10, moto: 0, trot: 0 } }));
    expect(ten.body).toMatchObject({ total: 2800, saved_dt: 0 });
    const eleven = await post(valid({ vehicles: { car: 10, moto: 1, trot: 0 } }));
    expect(eleven.body).toMatchObject({ total: 10 * 260 + 70, saved_dt: 10 * 20 + 10 });
    expect((await rows()).at(-1)).toMatchObject({ total_dt: 2670, saved_dt: 210 });
  });

  it('ignores any total or price sent by the browser', async () => {
    const r = await post({ ...valid(), total: 1 });
    expect(r.status).toBe(400);
    const r2 = await post(valid({ vehicles: { car: 1, moto: 0, trot: 0, price: 1 } }));
    expect(r2.status).toBe(400);
  });

  it('requires a company name for companies, and at least one vehicle', async () => {
    const co = await post(valid({ clientType: 'company', company: ' ' }));
    expect(co.status).toBe(400);
    expect(co.body.issues).toContainEqual({ path: 'company', code: 'reservation.company' });
    const none = await post(valid({ vehicles: { car: 0, moto: 0, trot: 0 } }));
    expect(none.body.issues).toContainEqual({ path: 'vehicles', code: 'reservation.vehicles' });
    const ok = await post(valid({ clientType: 'company', company: 'Agence Atlas' }));
    expect(ok.status).toBe(201);
    expect((await rows()).at(-1)).toMatchObject({ client_type: 'company', company: 'Agence Atlas' });
  });

  it('writes an audit entry without personal data', async () => {
    const res = (await t.deps.db.system.execute(
      sql`select metadata, ip from audit_log where action = 'reservation.created' order by id desc limit 1`,
    )) as unknown as { rows: { metadata: Record<string, unknown>; ip: string | null }[] };
    expect(res.rows[0]!.metadata).toEqual({ vehicles: 1, totalDt: 280 });
    expect(JSON.stringify(res.rows[0])).not.toContain('Amira');
  });

  it('updates the same phone within a day instead of adding a request', async () => {
    const body = valid({ phone: '50 111 222' });
    expect((await post(body)).status).toBe(201);
    const before = (await rows()).length;
    const again = await post({ ...body, vehicles: { car: 2, moto: 0, trot: 0 } });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ saved: true, duplicate: true, total: 560 });
    const all = await rows();
    expect(all.length).toBe(before);
    expect(all.find((x) => x.phone === '+21650111222')).toMatchObject({ qty_car: 2, total_dt: 560 });
  });

  it('rejects invalid fields with codes the page can translate', async () => {
    const r = await post(valid({ name: '  ', phone: '123', vehicles: { car: 100, moto: 0, trot: 0 }, city: 'x'.repeat(90) }));
    expect(r.status).toBe(400);
    const paths = Object.fromEntries((r.body.issues as { path: string; code: string }[]).map((i) => [i.path, i.code]));
    expect(paths).toMatchObject({ name: 'reservation.name', phone: 'reservation.phone', 'vehicles.car': 'reservation.vehicles', city: 'reservation.city' });
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

  it('limits requests per connection per hour', async () => {
    const from = ip();
    for (let i = 0; i < 3; i++) expect((await post(valid(), from)).status).toBe(201);
    const r = await post(valid(), from);
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('rate_limited');
    t.clock.advance(3600_000 + 1);
    expect((await post(valid(), from)).status).toBe(201);
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
