import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AlertDto } from '@winou/shared';
import { AlertEngine } from '../src/alerts/engine';
import { addMember, call, createDevice, createVehicle, makeApp, signup, type Client, type TestCtx } from './helpers';

const SECRET = 'test-ingest-secret-0123456789';
const KNOTS = 1 / 1.852;
let t: TestCtx;
let a: Client;
let manager: Client;
let viewer: Client;
let b: Client;
let vehicle: string;
let imei: string;
let bVehicle: string;
let bImei: string;

const TUNIS = { lat: 36.8008, lon: 10.1815 };

async function fix(deviceImei: string, o: { lat?: number; lon?: number; kmh?: number; battery?: number } = {}) {
  const r = await call(t, 'POST', '/ingest/traccar', {
    headers: { 'x-ingest-secret': SECRET },
    body: {
      position: {
        latitude: o.lat ?? TUNIS.lat,
        longitude: o.lon ?? TUNIS.lon,
        speed: (o.kmh ?? 0) * KNOTS,
        fixTime: t.clock.now().toISOString(),
        attributes: o.battery !== undefined ? { batteryLevel: o.battery } : {},
      },
      device: { uniqueId: deviceImei },
    },
  });
  expect(r.body.accepted).toBe(1);
}
const inbox = async (c: Client, status = 'open') => (await call(t, 'GET', `/orgs/${c.orgId}/alerts?status=${status}`, { token: c.token })).body as AlertDto[];
const rule = (c: Client, body: Record<string, unknown>) => call(t, 'POST', `/orgs/${c.orgId}/alert-rules`, { token: c.token, body });
const zone = (c: Client, body: Record<string, unknown>) => call(t, 'POST', `/orgs/${c.orgId}/zones`, { token: c.token, body });

beforeAll(async () => {
  // The test clock moves forward a lot in this file: keep access tokens valid throughout.
  t = await makeApp({ INGEST_SECRET: SECRET, ACCESS_TOKEN_TTL_SECONDS: '86400' });
  a = await signup(t, { orgName: 'Alertes A' });
  manager = await addMember(t, a, 'manager');
  viewer = await addMember(t, a, 'viewer');
  b = await signup(t, { orgName: 'Alertes B' });
  vehicle = (await createVehicle(t, a, '245 TUN 7812', { speedLimitKmh: 90 })).id;
  const d = await createDevice(t, a);
  imei = d.imei;
  await call(t, 'POST', `/orgs/${a.orgId}/devices/${d.id}/link`, { token: a.token, body: { vehicleId: vehicle } });
  bVehicle = (await createVehicle(t, b, '198 TUN 3044')).id;
  const bd = await createDevice(t, b);
  bImei = bd.imei;
  await call(t, 'POST', `/orgs/${b.orgId}/devices/${bd.id}/link`, { token: b.token, body: { vehicleId: bVehicle } });
});
afterAll(() => t.close());
beforeEach(() => t.clock.advance(60_000));

async function clearRules(c: Client) {
  const rules = (await call(t, 'GET', `/orgs/${c.orgId}/alert-rules`, { token: c.token })).body as { id: string }[];
  for (const r of rules) await call(t, 'DELETE', `/orgs/${c.orgId}/alert-rules/${r.id}`, { token: c.token });
}

describe('zones', () => {
  it('creates circles and polygons and returns their outline', async () => {
    const c = await zone(a, { name: 'Agence', shape: { kind: 'circle', center: [10.2336, 36.8322], radiusM: 300 } });
    expect(c.status).toBe(201);
    expect(c.body.ring.length).toBeGreaterThan(30);
    const p = await zone(a, { name: 'Centre', shape: { kind: 'polygon', points: [[10.17, 36.79], [10.2, 36.79], [10.2, 36.81], [10.17, 36.81]] } });
    expect(p.status).toBe(201);
    expect(p.body.shape.kind).toBe('polygon');
  });

  it('rejects invalid shapes', async () => {
    const bowtie = await zone(a, { name: 'X', shape: { kind: 'polygon', points: [[10, 36], [10.1, 36.1], [10.1, 36], [10, 36.1]] } });
    expect(bowtie.body.code).toBe('zone.invalid');
    expect((await zone(a, { name: 'X', shape: { kind: 'circle', center: [10, 36], radiusM: 10 } })).status).toBe(400);
    expect((await zone(a, { name: 'X', shape: { kind: 'polygon', points: [[10, 36], [10.1, 36.1]] } })).status).toBe(400);
  });

  it('only managers and owners can change zones; other organizations cannot see them', async () => {
    const body = { name: 'Viewer zone', shape: { kind: 'circle', center: [10, 36], radiusM: 500 } };
    expect((await zone(viewer, body)).status).toBe(403);
    expect((await zone(manager, body)).status).toBe(201);
    const mine = (await call(t, 'GET', `/orgs/${a.orgId}/zones`, { token: viewer.token })).body as { id: string }[];
    expect(mine.length).toBeGreaterThan(0);
    expect((await call(t, 'GET', `/orgs/${b.orgId}/zones`, { token: b.token })).body).toEqual([]);
    expect((await call(t, 'GET', `/orgs/${b.orgId}/zones/${mine[0]!.id}`, { token: b.token })).status).toBe(404);
    expect((await call(t, 'DELETE', `/orgs/${b.orgId}/zones/${mine[0]!.id}`, { token: b.token })).status).toBe(404);
  });
});

describe('alert rules', () => {
  beforeEach(() => clearRules(a));

  it('validates parameters per type', async () => {
    expect((await rule(a, { type: 'speeding', name: 'X', params: { limitKmh: 5 } })).status).toBe(400);
    expect((await rule(a, { type: 'low_battery', name: 'X', params: { thresholdPct: 20, extra: 1 } })).status).toBe(400);
    expect((await rule(a, { type: 'movement_schedule', name: 'X', params: { windows: [{ days: [8], start: '07:00', end: '19:00' }] } })).status).toBe(400);
    expect((await rule(a, { type: 'nope', name: 'X', params: {} })).status).toBe(400);
    const ok = await rule(a, { type: 'speeding', name: 'Vitesse', params: {} });
    expect(ok.status).toBe(201);
    expect(ok.body.params).toEqual({ limitKmh: null, minDurationS: 15 });
  });

  it('cannot reference another organization’s zone or vehicle', async () => {
    const bz = await zone(b, { name: 'B zone', shape: { kind: 'circle', center: [10, 36], radiusM: 500 } });
    expect((await rule(a, { type: 'geofence_exit', name: 'X', params: { geofenceId: bz.body.id } })).body.code).toBe('zone.not_found');
    expect((await rule(a, { type: 'speeding', name: 'X', params: {}, vehicleIds: [bVehicle] })).body.code).toBe('vehicle.not_found');
  });

  it('viewers cannot create, edit or delete rules; changes are audited', async () => {
    expect((await rule(viewer, { type: 'speeding', name: 'X', params: {} })).status).toBe(403);
    const r = await rule(manager, { type: 'low_battery', name: 'Batterie', params: { thresholdPct: 20 } });
    expect((await call(t, 'PATCH', `/orgs/${a.orgId}/alert-rules/${r.body.id}`, { token: viewer.token, body: { enabled: false } })).status).toBe(403);
    const upd = await call(t, 'PATCH', `/orgs/${a.orgId}/alert-rules/${r.body.id}`, { token: manager.token, body: { params: { thresholdPct: 15 } } });
    expect(upd.body.params).toEqual({ thresholdPct: 15 });
    expect((await call(t, 'PATCH', `/orgs/${a.orgId}/alert-rules/${r.body.id}`, { token: manager.token, body: { params: { thresholdPct: 99 } } })).status).toBe(400);
    const log = (await call(t, 'GET', `/orgs/${a.orgId}/audit-log`, { token: a.token })).body as { action: string; targetId: string; metadata: any }[];
    const entry = log.find((e) => e.action === 'alert_rule.updated' && e.targetId === r.body.id);
    expect(entry?.metadata.params).toEqual({ thresholdPct: 15 });
    expect(log.some((e) => e.action === 'alert_rule.created')).toBe(true);
    expect((await call(t, 'DELETE', `/orgs/${b.orgId}/alert-rules/${r.body.id}`, { token: b.token })).status).toBe(404);
  });
});

describe('alert engine through device data', () => {
  beforeEach(() => clearRules(a));

  it('speeding: alerts after sustained speed over the vehicle limit', async () => {
    await rule(a, { type: 'speeding', name: 'Excès', severity: 'urgent', params: { limitKmh: null, minDurationS: 15 } });
    const before = (await inbox(a)).length;
    for (let i = 0; i < 5; i++) {
      await fix(imei, { kmh: 120 });
      t.clock.advance(5_000);
    }
    const now = await inbox(a);
    expect(now.length).toBe(before + 1);
    expect(now[0]).toMatchObject({ type: 'speeding', severity: 'urgent', vehicle: { id: vehicle }, details: { limitKmh: 90 } });
    expect(now[0]!.position).not.toBeNull();
  });

  it('zone exit: alerts when the vehicle leaves the zone', async () => {
    const z = await zone(a, { name: 'Grand Tunis', shape: { kind: 'circle', center: [TUNIS.lon, TUNIS.lat], radiusM: 5000 } });
    await rule(a, { type: 'geofence_exit', name: 'Sortie', params: { geofenceId: z.body.id } });
    await fix(imei, { kmh: 40 });
    t.clock.advance(30_000);
    await fix(imei, { kmh: 40, lat: 36.4, lon: 10.6 }); // Hammamet
    const [latest] = await inbox(a);
    expect(latest).toMatchObject({ type: 'geofence_exit', details: { geofenceName: 'Grand Tunis' } });
    expect((await call(t, 'DELETE', `/orgs/${a.orgId}/zones/${z.body.id}`, { token: a.token })).body.code).toBe('zone.in_use');
  });

  it('low battery: alerts once when the reported level drops below the threshold', async () => {
    await rule(a, { type: 'low_battery', name: 'Batterie', params: { thresholdPct: 20 } });
    const before = (await inbox(a)).length;
    await fix(imei, { battery: 30 });
    t.clock.advance(10_000);
    await fix(imei, { battery: 18 });
    t.clock.advance(10_000);
    await fix(imei, { battery: 16 });
    const now = await inbox(a);
    expect(now.length).toBe(before + 1);
    expect(now[0]).toMatchObject({ type: 'low_battery', details: { batteryPct: 18 } });
  });

  it('movement outside allowed hours', async () => {
    await rule(a, { type: 'movement_schedule', name: 'Nuit', params: { windows: [] } });
    await fix(imei, { kmh: 30 });
    expect((await inbox(a))[0]).toMatchObject({ type: 'movement_schedule' });
  });

  it('device offline: the periodic check alerts once, and re-arms when the device reports', async () => {
    await rule(a, { type: 'device_offline', name: 'Hors ligne', severity: 'urgent', params: { afterMinutes: 15 } });
    await fix(imei);
    const engine = t.app.get(AlertEngine);
    expect(await engine.checkOffline()).toBe(0);
    await t.clock.travel(20 * 60_000, async () => {
      expect(await engine.checkOffline()).toBe(1);
      expect(await engine.checkOffline()).toBe(0);
    });
    expect((await inbox(a))[0]).toMatchObject({ type: 'device_offline', severity: 'urgent' });
  });

  it('a disabled rule or a rule for other vehicles does not alert', async () => {
    const r = await rule(a, { type: 'movement_schedule', name: 'Nuit', params: { windows: [] }, enabled: false });
    await rule(a, { type: 'movement_schedule', name: 'Autre', params: { windows: [] }, vehicleIds: [(await createVehicle(t, a)).id] });
    const before = (await inbox(a)).length;
    await fix(imei, { kmh: 30 });
    expect((await inbox(a)).length).toBe(before);
    expect(r.status).toBe(201);
  });

  it('never evaluates another organization’s rules', async () => {
    await clearRules(b);
    await rule(a, { type: 'movement_schedule', name: 'Nuit A', params: { windows: [] } });
    const before = (await inbox(b)).length;
    await fix(bImei, { kmh: 50 });
    expect((await inbox(b)).length).toBe(before);
  });
});

describe('alert inbox', () => {
  it('managers mark alerts handled; viewers cannot; other organizations cannot see them', async () => {
    const [first] = await inbox(a);
    expect(first).toBeDefined();
    expect((await call(t, 'POST', `/orgs/${a.orgId}/alerts/${first!.id}/handle`, { token: viewer.token, body: {} })).status).toBe(403);
    expect((await call(t, 'POST', `/orgs/${b.orgId}/alerts/${first!.id}/handle`, { token: b.token, body: {} })).status).toBe(404);
    expect((await inbox(b)).some((x) => x.id === first!.id)).toBe(false);

    const h = await call(t, 'POST', `/orgs/${a.orgId}/alerts/${first!.id}/handle`, { token: manager.token, body: { note: 'Client appelé' } });
    expect(h.body).toMatchObject({ status: 'handled', note: 'Client appelé', handledBy: { id: manager.me.id } });
    expect((await inbox(a, 'handled')).some((x) => x.id === first!.id)).toBe(true);
    expect((await inbox(a)).some((x) => x.id === first!.id)).toBe(false);
    const count = await call(t, 'GET', `/orgs/${a.orgId}/alerts/count`, { token: viewer.token });
    expect(count.body.open).toBe((await inbox(a)).length);

    // Reopen: same permission as handling, scoped to the organization, and audited.
    expect((await call(t, 'POST', `/orgs/${a.orgId}/alerts/${first!.id}/reopen`, { token: viewer.token })).status).toBe(403);
    expect((await call(t, 'POST', `/orgs/${b.orgId}/alerts/${first!.id}/reopen`, { token: b.token })).status).toBe(404);
    const r = await call(t, 'POST', `/orgs/${a.orgId}/alerts/${first!.id}/reopen`, { token: manager.token });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'open', handledAt: null, handledBy: null, note: null });
    expect((await inbox(a)).some((x) => x.id === first!.id)).toBe(true);
    const audit = await t.deps.db.system.execute(sql`select 1 from audit_log where action = 'alert.reopened' and target_id = ${first!.id}`);
    expect(audit.rows.length).toBe(1);
  });

  it('Row-Level Security: alerts are invisible and read-only across organizations', async () => {
    const rows = await t.deps.db.tenant(b.orgId, (tx) => tx.execute(sql`select org_id from alerts`));
    expect((rows.rows as { org_id: string }[]).every((r) => r.org_id === b.orgId)).toBe(true);
    await expect(t.deps.db.tenant(a.orgId, (tx) => tx.execute(sql`delete from alerts`))).rejects.toThrow();
  });
});

describe('trips report', () => {
  it('detects a trip from stored fixes and lists events in the range', async () => {
    // A fresh vehicle, so earlier tests' movements do not show up.
    const v = (await createVehicle(t, a)).id;
    const d = await createDevice(t, a);
    await call(t, 'POST', `/orgs/${a.orgId}/devices/${d.id}/link`, { token: a.token, body: { vehicleId: v } });
    const imei = d.imei;
    const vehicle = v;
    const from = t.clock.now();
    // Parked, then 15 minutes driving east at 50 km/h, then parked 10 minutes.
    for (let s = 0; s < 120; s += 30) {
      await fix(imei, { lat: 36.8, lon: 10.1 });
      t.clock.advance(30_000);
    }
    let lon = 10.1;
    for (let s = 0; s < 900; s += 15) {
      lon += (50 / 3.6) * 15 / (111_320 * Math.cos((36.8 * Math.PI) / 180));
      await fix(imei, { lat: 36.8, lon, kmh: 50 });
      t.clock.advance(15_000);
    }
    for (let s = 0; s < 600; s += 60) {
      await fix(imei, { lat: 36.8, lon });
      t.clock.advance(60_000);
    }
    const to = t.clock.now();
    const r = await call(t, 'GET', `/orgs/${a.orgId}/vehicles/${vehicle}/trips?from=${from.toISOString()}&to=${to.toISOString()}`, { token: viewer.token });
    expect(r.status).toBe(200);
    expect(r.body.trips).toHaveLength(1);
    const trip = r.body.trips[0];
    expect(trip.distanceM).toBeGreaterThan(11_500);
    expect(trip.distanceM).toBeLessThan(13_500);
    expect(trip.maxSpeedKmh).toBe(50);
    expect(trip.path.length).toBeGreaterThanOrEqual(2);
    expect(r.body.summary.trips).toBe(1);
    expect(r.body.lastPosition).not.toBeNull();
  });

  it('is limited to 31 days and to the caller’s organization', async () => {
    const from = new Date(t.clock.now().getTime() - 40 * 86_400_000).toISOString();
    const to = t.clock.now().toISOString();
    expect((await call(t, 'GET', `/orgs/${a.orgId}/vehicles/${vehicle}/trips?from=${from}&to=${to}`, { token: a.token })).status).toBe(400);
    const okFrom = new Date(t.clock.now().getTime() - 86_400_000).toISOString();
    expect((await call(t, 'GET', `/orgs/${b.orgId}/vehicles/${vehicle}/trips?from=${okFrom}&to=${to}`, { token: b.token })).status).toBe(404);
    expect((await call(t, 'GET', `/orgs/${a.orgId}/vehicles/${vehicle}/trips?from=${okFrom}&to=${to}`, { token: b.token })).status).toBe(404);
  });
});

describe('editing rules and zones resets their state', () => {
  it('a zone moved under a vehicle re-learns instead of alerting', async () => {
    await clearRules(a);
    const z = await zone(a, { name: 'Port', shape: { kind: 'circle', center: [TUNIS.lon, TUNIS.lat], radiusM: 2000 } });
    await rule(a, { type: 'geofence_exit', name: 'Sortie port', params: { geofenceId: z.body.id } });
    await fix(imei, { kmh: 20 }); // inside
    const moved = await call(t, 'PATCH', `/orgs/${a.orgId}/zones/${z.body.id}`, { token: a.token, body: { shape: { kind: 'circle', center: [10.6, 36.4], radiusM: 2000 } } });
    expect(moved.status).toBe(200);
    const before = (await inbox(a)).length;
    t.clock.advance(10_000);
    await fix(imei, { kmh: 20 }); // now outside the moved zone: first fix after the change, so no alert
    expect((await inbox(a)).length).toBe(before);
  });
});
