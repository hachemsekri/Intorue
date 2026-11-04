import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { LiveEvent, VehicleLiveDto } from '@winou/shared';
import { devices } from '../src/db/schema';
import { TraccarGateway } from '../src/gateway/traccar.gateway';
import { addMember, call, createDevice, createVehicle, makeApp, signup, type Client, type TestCtx } from './helpers';

const SECRET = 'test-ingest-secret-0123456789';

let t: TestCtx;
let a: Client;
let b: Client;
let aVehicle: string;
let aImei: string;
let bImei: string;

function forward(imei: string, o: { lat?: number; lon?: number; knots?: number; at?: Date; battery?: number; simulated?: boolean; valid?: boolean } = {}) {
  return {
    position: {
      latitude: o.lat ?? 36.8065,
      longitude: o.lon ?? 10.1815,
      speed: o.knots ?? 0,
      course: 90,
      valid: o.valid ?? true,
      fixTime: (o.at ?? t.clock.now()).toISOString(),
      attributes: { ...(o.battery !== undefined ? { batteryLevel: o.battery } : {}), ...(o.simulated ? { simulated: true } : {}) },
    },
    device: { uniqueId: imei },
  };
}

const ingest = (body: unknown, secret: string | null = SECRET) =>
  call(t, 'POST', '/ingest/traccar', { body, headers: secret ? { 'x-ingest-secret': secret } : {} });

const liveOf = async (c: Client) => (await call(t, 'GET', `/orgs/${c.orgId}/live`, { token: c.token })).body as VehicleLiveDto[];

beforeAll(async () => {
  t = await makeApp({ INGEST_SECRET: SECRET });
  a = await signup(t, { orgName: 'Live A' });
  b = await signup(t, { orgName: 'Live B' });
  aVehicle = (await createVehicle(t, a, '245 TUN 7812')).id;
  const ad = await createDevice(t, a);
  aImei = ad.imei;
  await call(t, 'POST', `/orgs/${a.orgId}/devices/${ad.id}/link`, { token: a.token, body: { vehicleId: aVehicle } });
  const bv = (await createVehicle(t, b, '198 TUN 3044')).id;
  const bd = await createDevice(t, b);
  bImei = bd.imei;
  await call(t, 'POST', `/orgs/${b.orgId}/devices/${bd.id}/link`, { token: b.token, body: { vehicleId: bv } });
});
afterAll(() => t.close());

describe('Traccar adapter', () => {
  const g = new TraccarGateway();
  it('converts knots to km/h and maps attributes', () => {
    const [p] = g.normalize({
      position: { latitude: 36.8, longitude: 10.18, speed: 27, course: 359.6, fixTime: '2026-11-04T08:00:00.000+00:00', valid: true, attributes: { batteryLevel: 87.4, ignition: true, sat: 9, motion: true, ip: '1.2.3.4' } },
      device: { uniqueId: '490154203237518' },
    });
    expect(p).toMatchObject({ imei: '490154203237518', speedKmh: 50, heading: 0, batteryPct: 87, ignition: true, satellites: 9, source: 'device', valid: true });
    expect(p!.recordedAt.toISOString()).toBe('2026-11-04T08:00:00.000Z');
    expect(p!.attrs).toEqual({ motion: true, sat: 9 }); // unlisted attributes (ip) dropped
  });
  it('ignores battery voltage (no percentage) and flags simulator data', () => {
    const [p] = g.normalize({ position: { latitude: 0, longitude: 0, fixTime: '2026-11-04T08:00:00Z', attributes: { battery: 3.9, simulated: true } }, device: { uniqueId: 'x1' } });
    expect(p!.batteryPct).toBeNull();
    expect(p!.source).toBe('simulator');
  });
  it('rejects malformed payloads', () => {
    expect(() => g.normalize({ position: { latitude: 200, longitude: 0, fixTime: '2026-11-04T08:00:00Z' }, device: { uniqueId: 'x' } })).toThrow();
    expect(() => g.normalize({ position: { latitude: 1, longitude: 1 }, device: { uniqueId: 'x' } })).toThrow();
    expect(() => g.normalize({ nope: true })).toThrow();
  });
});

describe('ingest endpoint', () => {
  // Each test sends fixes at a new instant so they are not deduplicated against earlier ones.
  beforeEach(() => t.clock.advance(10_000));
  it('requires the shared secret', async () => {
    expect((await ingest(forward(aImei), null)).status).toBe(401);
    expect((await ingest(forward(aImei), 'wrong-secret-wrong-secret-xx')).status).toBe(401);
  });

  it('is disabled when no secret is configured', async () => {
    const off = await makeApp({ INGEST_SECRET: '' });
    try {
      const r = await call(off, 'POST', '/ingest/traccar', { body: forward(aImei), headers: { 'x-ingest-secret': SECRET } });
      expect(r.status).toBe(404);
    } finally {
      await off.close();
    }
  });

  it('returns 400 on invalid payloads', async () => {
    expect((await ingest({ position: { latitude: 'x' } })).status).toBe(400);
  });

  it('ignores unregistered devices without creating anything', async () => {
    const r = await ingest(forward('999999999999994'));
    expect(r.body).toEqual({ accepted: 0, duplicates: 0, unknownDevice: 1, rejected: 0 });
    const [{ n }] = (await t.deps.db.system.execute(sql`select count(*)::int n from devices where imei = '999999999999994'`)).rows as any;
    expect(n).toBe(0);
  });

  it('stores a fix, updates the device and the live map', async () => {
    const r = await ingest(forward(aImei, { knots: 27, battery: 64, lat: 36.81, lon: 10.18 }));
    expect(r.body.accepted).toBe(1);
    const [v] = await liveOf(a);
    expect(v).toMatchObject({ vehicleId: aVehicle, device: { imei: aImei, batteryPct: 64 }, position: { lat: 36.81, lon: 10.18, speedKmh: 50, source: 'device' } });
    expect(v!.device!.lastSeenAt).toBe(t.clock.now().toISOString());
    expect(v!.position!.movingSince).toBe(t.clock.now().toISOString());
  });

  it('deduplicates retried fixes', async () => {
    const at = new Date(t.clock.now().getTime() - 1000);
    expect((await ingest(forward(aImei, { at }))).body.accepted).toBe(1);
    expect((await ingest(forward(aImei, { at }))).body.duplicates).toBe(1);
  });

  it('stores late fixes without moving the live marker backwards', async () => {
    await ingest(forward(aImei, { lat: 36.85, at: t.clock.now() }));
    const late = await ingest(forward(aImei, { lat: 36.7, at: new Date(t.clock.now().getTime() - 120_000) }));
    expect(late.body.accepted).toBe(1);
    expect((await liveOf(a))[0]!.position!.lat).toBe(36.85);
  });

  it('rejects fixes from the future, without GPS lock, or older than retention', async () => {
    expect((await ingest(forward(aImei, { at: new Date(t.clock.now().getTime() + 3600_000) }))).body.rejected).toBe(1);
    expect((await ingest(forward(aImei, { valid: false }))).body.rejected).toBe(1);
    expect((await ingest(forward(aImei, { at: new Date(t.clock.now().getTime() - 100 * 86_400_000) }))).body.rejected).toBe(1);
  });

  it('tracks moving/stopped since', async () => {
    await ingest(forward(aImei, { knots: 20 }));
    t.clock.advance(30_000);
    await ingest(forward(aImei, { knots: 0 }));
    const stoppedAt = t.clock.now().toISOString();
    t.clock.advance(30_000);
    await ingest(forward(aImei, { knots: 0.5 }));
    const p = (await liveOf(a))[0]!.position!;
    expect(p.stoppedSince).toBe(stoppedAt);
    expect(p.movingSince).toBeNull();
  });

  it('accepts batches and labels simulator data', async () => {
    t.clock.advance(5_000);
    const r = await ingest([forward(aImei, { knots: 10, simulated: true }), forward(bImei, { knots: 5 })]);
    expect(r.body.accepted).toBe(2);
    expect((await liveOf(a))[0]!.position!.source).toBe('simulator');
  });

  it('stores fixes from an unlinked device without a vehicle', async () => {
    const d = await createDevice(t, a);
    t.clock.advance(1_000);
    expect((await ingest(forward(d.imei))).body.accepted).toBe(1);
    const [dev] = await t.deps.db.system.select().from(devices).where(eq(devices.id, d.id));
    expect(dev!.lastSeenAt).not.toBeNull();
  });
});

describe('live data separation', () => {
  it('each organization sees only its own vehicles and positions', async () => {
    const la = await liveOf(a);
    const lb = await liveOf(b);
    expect(la.map((v) => v.vehicleId)).toEqual([aVehicle]);
    expect(lb.some((v) => v.vehicleId === aVehicle)).toBe(false);
    expect((await call(t, 'GET', `/orgs/${b.orgId}/live`, { token: a.token })).status).toBe(404);
    expect((await call(t, 'POST', `/orgs/${b.orgId}/live/ticket`, { token: a.token })).status).toBe(404);
  });

  it('Row-Level Security hides other organizations’ positions', async () => {
    const rows = await t.deps.db.tenant(b.orgId, (tx) => tx.execute(sql`select org_id from positions`));
    const orgs = new Set((rows.rows as { org_id: string }[]).map((r) => r.org_id));
    expect(orgs).toEqual(new Set([b.orgId]));
    await expect(t.deps.db.tenant(b.orgId, (tx) => tx.execute(sql`delete from positions`))).rejects.toThrow();
  });
});

describe('live WebSocket', () => {
  let base: string;
  beforeAll(async () => {
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const addr = t.app.getHttpServer().address() as { port: number };
    base = `ws://127.0.0.1:${addr.port}/api/live/ws`;
  });

  async function open(c: Client, opts: { headers?: Record<string, string>; ticket?: string } = {}) {
    const ticket = opts.ticket ?? (await call(t, 'POST', `/orgs/${c.orgId}/live/ticket`, { token: c.token })).body.ticket;
    const ws = new WebSocket(base, { headers: opts.headers ?? {} });
    const events: LiveEvent[] = [];
    const closed = new Promise<number>((res) => ws.on('close', (code) => res(code)));
    ws.on('message', (m) => events.push(JSON.parse(String(m))));
    ws.on('error', () => {});
    await new Promise<void>((res) => {
      ws.on('open', () => res());
      ws.on('close', () => res());
    });
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'auth', ticket }));
    await waitFor(() => events.length > 0 || ws.readyState >= WebSocket.CLOSING);
    return { ws, events, ticket, closed };
  }

  it('streams only the subscribing organization’s updates', async () => {
    const sa = await open(a);
    const sb = await open(b);
    expect(sa.events[0]).toEqual({ type: 'hello', orgId: a.orgId });
    expect(sb.events[0]).toEqual({ type: 'hello', orgId: b.orgId });
    t.clock.advance(5_000);
    await ingest(forward(aImei, { knots: 20 }));
    await waitFor(() => sa.events.length > 1);
    const ev = sa.events[1] as Extract<LiveEvent, { type: 'vehicle' }>;
    expect(ev.data.vehicleId).toBe(aVehicle);
    await new Promise((r) => setTimeout(r, 100));
    expect(sb.events.filter((e) => e.type === 'vehicle')).toHaveLength(0);
    sa.ws.close();
    sb.ws.close();
  });

  it('works for viewers', async () => {
    const viewer = await addMember(t, a, 'viewer');
    const s = await open(viewer);
    expect(s.events[0]).toMatchObject({ type: 'hello' });
    s.ws.close();
  });

  it('rejects reused and forged tickets', async () => {
    const first = await open(a);
    first.ws.close();
    const reuse = await open(a, { ticket: first.ticket });
    expect(await reuse.closed).toBe(4401);
    const forged = await open(a, { ticket: 'eyJhbGciOiJub25lIn0.e30.' });
    expect(await forged.closed).toBe(4401);
  });

  it('closes sockets that never authenticate', async () => {
    const ws = new WebSocket(base);
    const code = await new Promise<number>((res) => ws.on('close', (c) => res(c)));
    expect(code).toBe(4401);
  }, 10_000);

  it('rejects connections from foreign web origins', async () => {
    const s = await open(a, { headers: { origin: 'https://evil.example' } });
    expect(await s.closed).toBe(4403);
    expect(s.events.filter((e) => e.type === 'hello')).toHaveLength(0);
  });

  it('a ticket cannot be used after the member is removed', async () => {
    const tmp = await addMember(t, a, 'viewer');
    const { ticket } = (await call(t, 'POST', `/orgs/${a.orgId}/live/ticket`, { token: tmp.token })).body;
    await call(t, 'DELETE', `/orgs/${a.orgId}/members/${tmp.me.id}`, { token: a.token });
    const s = await open(tmp, { ticket });
    expect(await s.closed).toBe(4401);
  });
});

describe('retention', () => {
  it('deletes positions older than the organization’s setting, and only those', async () => {
    const count = async (orgId: string) =>
      ((await t.deps.db.system.execute(sql`select count(*)::int n from positions where org_id = ${orgId}`)).rows[0] as any).n as number;
    await call(t, 'PATCH', `/orgs/${a.orgId}`, { token: a.token, body: { locationRetentionDays: 7 } });
    const before = { a: await count(a.orgId), b: await count(b.orgId) };
    expect(before.a).toBeGreaterThan(0);
    const { RetentionService } = await import('../src/positions/retention.service');
    const retention = t.app.get(RetentionService);
    await t.clock.travel(8 * 86_400_000, () => retention.run());
    expect(await count(a.orgId)).toBe(0); // 7-day org: everything older than 7 days is gone
    expect(await count(b.orgId)).toBe(before.b); // 90-day org untouched
  });
});

async function waitFor(cond: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
