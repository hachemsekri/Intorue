import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, devices, vehicles } from '../src/db/schema';
import { call, createDevice, createVehicle, makeApp, newImei, signup, type Client, type TestCtx } from './helpers';

/**
 * Strict data separation: a member of org A must never read or change anything in org B,
 * whatever IDs they send. The API answers 404 so it does not even confirm B's resources exist.
 */
let t: TestCtx;
let a: Client;
let b: Client;
let aVehicle: string;
let aDevice: string;
let bVehicle: string;
let bDevice: string;

beforeAll(async () => {
  t = await makeApp();
  a = await signup(t, { orgName: 'Org A' });
  b = await signup(t, { orgName: 'Org B' });
  aVehicle = (await createVehicle(t, a, '100 TUN 1')).id;
  aDevice = (await createDevice(t, a)).id;
  bVehicle = (await createVehicle(t, b, '200 TUN 2')).id;
  bDevice = (await createDevice(t, b)).id;
  await call(t, 'POST', `/orgs/${b.orgId}/devices/${bDevice}/link`, { token: b.token, body: { vehicleId: bVehicle } });
});
afterAll(() => t.close());

describe('cross-organization access through B’s orgId', () => {
  const routes: [string, string, () => string, unknown?][] = [
    ['GET', 'org', () => `/orgs/${b.orgId}`],
    ['PATCH', 'org', () => `/orgs/${b.orgId}`, { name: 'Hacked' }],
    ['GET', 'members', () => `/orgs/${b.orgId}/members`],
    ['GET', 'invitations', () => `/orgs/${b.orgId}/invitations`],
    ['POST', 'invite', () => `/orgs/${b.orgId}/invitations`, { email: 'x@example.test', role: 'owner' }],
    ['GET', 'audit', () => `/orgs/${b.orgId}/audit-log`],
    ['GET', 'vehicles', () => `/orgs/${b.orgId}/vehicles`],
    ['POST', 'vehicles', () => `/orgs/${b.orgId}/vehicles`, { type: 'car', name: 'X', plate: '1 TUN 1' }],
    ['GET', 'vehicle', () => `/orgs/${b.orgId}/vehicles/${bVehicle}`],
    ['PATCH', 'vehicle', () => `/orgs/${b.orgId}/vehicles/${bVehicle}`, { name: 'X' }],
    ['POST', 'vehicle archive', () => `/orgs/${b.orgId}/vehicles/${bVehicle}/archive`],
    ['GET', 'devices', () => `/orgs/${b.orgId}/devices`],
    ['POST', 'devices', () => `/orgs/${b.orgId}/devices`, { imei: newImei() }],
    ['GET', 'device', () => `/orgs/${b.orgId}/devices/${bDevice}`],
    ['POST', 'device unlink', () => `/orgs/${b.orgId}/devices/${bDevice}/unlink`],
    ['POST', 'device archive', () => `/orgs/${b.orgId}/devices/${bDevice}/archive`],
    ['PATCH', 'member role', () => `/orgs/${b.orgId}/members/${b.me.id}`, { role: 'viewer' }],
    ['DELETE', 'member', () => `/orgs/${b.orgId}/members/${b.me.id}`],
  ];
  for (const [method, name, url, body] of routes) {
    it(`${method} ${name} → 404`, async () => {
      const r = await call(t, method as any, url(), { token: a.token, body });
      expect(r.status).toBe(404);
      expect(r.body.code).toBe('not_found');
    });
  }
});

describe('cross-organization access through A’s own orgId with B’s resource IDs', () => {
  it('cannot read, edit or archive B’s vehicle', async () => {
    for (const [m, url, body] of [
      ['GET', `/orgs/${a.orgId}/vehicles/${bVehicle}`],
      ['PATCH', `/orgs/${a.orgId}/vehicles/${bVehicle}`, { name: 'X' }],
      ['POST', `/orgs/${a.orgId}/vehicles/${bVehicle}/archive`],
      ['POST', `/orgs/${a.orgId}/vehicles/${bVehicle}/unarchive`],
    ] as const) {
      expect((await call(t, m, url, { token: a.token, body })).status).toBe(404);
    }
  });

  it('cannot read, edit, unlink or archive B’s device', async () => {
    for (const [m, url, body] of [
      ['GET', `/orgs/${a.orgId}/devices/${bDevice}`],
      ['PATCH', `/orgs/${a.orgId}/devices/${bDevice}`, { label: 'X' }],
      ['POST', `/orgs/${a.orgId}/devices/${bDevice}/unlink`],
      ['POST', `/orgs/${a.orgId}/devices/${bDevice}/archive`],
    ] as const) {
      expect((await call(t, m, url, { token: a.token, body })).status).toBe(404);
    }
  });

  it('cannot link its device to B’s vehicle, nor B’s device to its vehicle', async () => {
    const r1 = await call(t, 'POST', `/orgs/${a.orgId}/devices/${aDevice}/link`, { token: a.token, body: { vehicleId: bVehicle } });
    expect(r1.status).toBe(404);
    const r2 = await call(t, 'POST', `/orgs/${a.orgId}/devices/${bDevice}/link`, { token: a.token, body: { vehicleId: aVehicle } });
    expect(r2.status).toBe(404);
  });

  it('cannot revoke B’s invitations', async () => {
    const inv = await call(t, 'POST', `/orgs/${b.orgId}/invitations`, { token: b.token, body: { email: 'z@example.test', role: 'viewer' } });
    const r = await call(t, 'DELETE', `/orgs/${a.orgId}/invitations/${inv.body.id}`, { token: a.token });
    expect(r.status).toBe(404);
  });

  it('cannot change B’s member through its own org', async () => {
    const r = await call(t, 'PATCH', `/orgs/${a.orgId}/members/${b.me.id}`, { token: a.token, body: { role: 'viewer' } });
    expect(r.status).toBe(404);
  });

  it('lists only its own data', async () => {
    const v = await call(t, 'GET', `/orgs/${a.orgId}/vehicles`, { token: a.token });
    expect(v.body.map((x: any) => x.id)).toEqual([aVehicle]);
    const d = await call(t, 'GET', `/orgs/${a.orgId}/devices`, { token: a.token });
    expect(d.body.map((x: any) => x.id)).toEqual([aDevice]);
    const log = await call(t, 'GET', `/orgs/${a.orgId}/audit-log`, { token: a.token });
    expect(log.body.every((e: any) => e.actor?.id === a.me.id)).toBe(true);
  });

  it('IMEI registered in B is refused for A without revealing the owner', async () => {
    const [bd] = (await call(t, 'GET', `/orgs/${b.orgId}/devices`, { token: b.token })).body;
    const r = await call(t, 'POST', `/orgs/${a.orgId}/devices`, { token: a.token, body: { imei: bd.imei } });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).not.toContain(b.orgId);
  });

  it('rejects malformed IDs as 404', async () => {
    expect((await call(t, 'GET', `/orgs/not-a-uuid/vehicles`, { token: a.token })).status).toBe(404);
    expect((await call(t, 'GET', `/orgs/${a.orgId}/vehicles/1 or 1=1`, { token: a.token })).status).toBe(404);
  });
});

describe('database Row-Level Security (second wall)', () => {
  it('a tenant transaction sees only its own rows even without a WHERE clause', async () => {
    const db = t.deps.db;
    const seen = await db.tenant(a.orgId, (tx) => tx.select({ org: vehicles.orgId }).from(vehicles));
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map((r) => r.org))).toEqual(new Set([a.orgId]));
    const devs = await db.tenant(a.orgId, (tx) => tx.select({ org: devices.orgId }).from(devices));
    expect(new Set(devs.map((r) => r.org))).toEqual(new Set([a.orgId]));
  });

  it('a tenant transaction cannot write rows for another organization', async () => {
    await expect(
      t.deps.db.tenant(a.orgId, (tx) =>
        tx.insert(vehicles).values({ orgId: b.orgId, type: 'car', name: 'X', plate: '9 TUN 9', plateFormat: 'tn_standard' }),
      ),
    ).rejects.toThrow();
    await expect(
      t.deps.db.tenant(a.orgId, (tx) => tx.execute(sql`update vehicles set name = 'pwned'`)),
    ).resolves.toBeTruthy();
    const [bv] = await t.deps.db.tenant(b.orgId, (tx) => tx.select().from(vehicles));
    expect(bv!.name).not.toBe('pwned');
  });

  it('the audit log is append-only for the application role', async () => {
    await expect(t.deps.db.tenant(a.orgId, (tx) => tx.delete(auditLog))).rejects.toThrow();
    await expect(t.deps.db.tenant(a.orgId, (tx) => tx.update(auditLog).set({ action: 'x' }))).rejects.toThrow();
  });

  it('without an org context, tenant tables return nothing', async () => {
    const rows = await t.deps.db.system.transaction(async (tx) => {
      await tx.execute(sql`set local role winou_app`);
      return tx.select().from(vehicles);
    });
    expect(rows).toHaveLength(0);
  });
});
