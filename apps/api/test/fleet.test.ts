import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { devices } from '../src/db/schema';
import { call, createDevice, createVehicle, makeApp, newImei, signup, type Client, type TestCtx } from './helpers';

let t: TestCtx;
let c: Client;
const url = (p: string) => `/orgs/${c.orgId}${p}`;

beforeAll(async () => {
  t = await makeApp();
  c = await signup(t, { orgName: 'Flotte Test' });
});
afterAll(() => t.close());

describe('vehicles', () => {
  it('creates a vehicle with a normalized Tunisian plate', async () => {
    const v = await createVehicle(t, c, '245tun7812', { type: 'motorcycle', name: 'Yamaha' });
    expect(v).toMatchObject({ plate: '245 TUN 7812', plateFormat: 'tn_standard', type: 'motorcycle', device: null });
  });

  it('accepts Arabic plates, RS plates and free-form plates', async () => {
    expect((await createVehicle(t, c, '231 تونس 1590')).plate).toBe('231 TUN 1590');
    expect((await createVehicle(t, c, '123456 RS')).plateFormat).toBe('tn_rs');
    expect((await createVehicle(t, c, 'TR-014', { type: 'scooter' })).plateFormat).toBe('other');
  });

  it('rejects an invalid plate for a forced format and a duplicate active plate', async () => {
    const bad = await call(t, 'POST', url('/vehicles'), {
      token: c.token,
      body: { type: 'car', name: 'X', plate: 'ABC', plateFormat: 'tn_standard' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.issues[0].code).toBe('plate.invalid');

    await createVehicle(t, c, '198 TUN 3044');
    const dup = await call(t, 'POST', url('/vehicles'), { token: c.token, body: { type: 'car', name: 'Y', plate: '198 tun 3044' } });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('plate.duplicate');
  });

  it('rejects unknown vehicle types', async () => {
    const r = await call(t, 'POST', url('/vehicles'), { token: c.token, body: { type: 'truck', name: 'X', plate: '1 TUN 1' } });
    expect(r.status).toBe(400);
  });

  it('edits, filters, searches, archives and restores', async () => {
    const v = await createVehicle(t, c, '220 TUN 9087', { name: 'Kia Picanto' });
    const e = await call(t, 'PATCH', url(`/vehicles/${v.id}`), { token: c.token, body: { color: 'Rouge', speedLimitKmh: 90 } });
    expect(e.body).toMatchObject({ color: 'Rouge', speedLimitKmh: 90 });

    const search = await call(t, 'GET', url('/vehicles?q=picanto'), { token: c.token });
    expect(search.body.map((x: any) => x.id)).toEqual([v.id]);
    const byPlate = await call(t, 'GET', url('/vehicles?q=9087'), { token: c.token });
    expect(byPlate.body.map((x: any) => x.id)).toEqual([v.id]);
    const scooters = await call(t, 'GET', url('/vehicles?type=scooter'), { token: c.token });
    expect(scooters.body.every((x: any) => x.type === 'scooter')).toBe(true);

    const a = await call(t, 'POST', url(`/vehicles/${v.id}/archive`), { token: c.token });
    expect(a.body.archivedAt).not.toBeNull();
    const active = await call(t, 'GET', url('/vehicles'), { token: c.token });
    expect(active.body.find((x: any) => x.id === v.id)).toBeUndefined();
    const archived = await call(t, 'GET', url('/vehicles?archived=true'), { token: c.token });
    expect(archived.body.map((x: any) => x.id)).toContain(v.id);

    // The plate becomes free while archived; restoring then conflicts.
    const reuse = await createVehicle(t, c, '220 TUN 9087');
    const restore = await call(t, 'POST', url(`/vehicles/${v.id}/unarchive`), { token: c.token });
    expect(restore.body.code).toBe('plate.duplicate');
    await call(t, 'POST', url(`/vehicles/${reuse.id}/archive`), { token: c.token });
    expect((await call(t, 'POST', url(`/vehicles/${v.id}/unarchive`), { token: c.token })).body.archivedAt).toBeNull();
  });
});

describe('devices', () => {
  it('validates the device ID format (8–20 digits)', async () => {
    for (const imei of ['12345', 'abcdefghijklmno', '123456789012345678901']) {
      const r = await call(t, 'POST', url('/devices'), { token: c.token, body: { imei } });
      expect(r.status).toBe(400);
    }
    const ok = await call(t, 'POST', url('/devices'), { token: c.token, body: { imei: '49 015420 323751 8' } });
    expect(ok.status).toBe(201);
    expect(ok.body.imei).toBe('490154203237518');
    // A wrong check digit or a short tracker ID is accepted.
    expect((await call(t, 'POST', url('/devices'), { token: c.token, body: { imei: '490154203237519' } })).status).toBe(201);
    expect((await call(t, 'POST', url('/devices'), { token: c.token, body: { imei: '4209951530' } })).status).toBe(201);
  });

  it('refuses a duplicate active IMEI', async () => {
    const imei = newImei();
    await createDevice(t, c, imei);
    const r = await call(t, 'POST', url('/devices'), { token: c.token, body: { imei } });
    expect(r.body.code).toBe('imei.already_registered');
  });

  it('links one device to one vehicle, both ways', async () => {
    const v1 = await createVehicle(t, c);
    const v2 = await createVehicle(t, c);
    const d1 = await createDevice(t, c);
    const d2 = await createDevice(t, c);

    const l = await call(t, 'POST', url(`/devices/${d1.id}/link`), { token: c.token, body: { vehicleId: v1.id } });
    expect(l.status).toBe(200);
    expect(l.body.vehicle.id).toBe(v1.id);
    expect((await call(t, 'GET', url(`/vehicles/${v1.id}`), { token: c.token })).body.device.id).toBe(d1.id);

    const again = await call(t, 'POST', url(`/devices/${d1.id}/link`), { token: c.token, body: { vehicleId: v2.id } });
    expect(again.body.code).toBe('device.already_linked');
    const taken = await call(t, 'POST', url(`/devices/${d2.id}/link`), { token: c.token, body: { vehicleId: v1.id } });
    expect(taken.body.code).toBe('vehicle.already_has_device');

    const u = await call(t, 'POST', url(`/devices/${d1.id}/unlink`), { token: c.token });
    expect(u.body.vehicle).toBeNull();
    expect((await call(t, 'POST', url(`/devices/${d1.id}/link`), { token: c.token, body: { vehicleId: v2.id } })).status).toBe(200);
  });

  it('archiving a vehicle or device ends the link', async () => {
    const v = await createVehicle(t, c);
    const d = await createDevice(t, c);
    await call(t, 'POST', url(`/devices/${d.id}/link`), { token: c.token, body: { vehicleId: v.id } });
    await call(t, 'POST', url(`/vehicles/${v.id}/archive`), { token: c.token });
    expect((await call(t, 'GET', url(`/devices/${d.id}`), { token: c.token })).body.vehicle).toBeNull();
    const toArchived = await call(t, 'POST', url(`/devices/${d.id}/link`), { token: c.token, body: { vehicleId: v.id } });
    expect(toArchived.body.code).toBe('vehicle.archived');

    const v2 = await createVehicle(t, c);
    await call(t, 'POST', url(`/devices/${d.id}/link`), { token: c.token, body: { vehicleId: v2.id } });
    await call(t, 'POST', url(`/devices/${d.id}/archive`), { token: c.token });
    expect((await call(t, 'GET', url(`/vehicles/${v2.id}`), { token: c.token })).body.device).toBeNull();
    // An archived device's IMEI can be registered again.
    expect((await call(t, 'POST', url('/devices'), { token: c.token, body: { imei: d.imei } })).status).toBe(201);
  });

  it('derives status from the last report: never, online, offline', async () => {
    const d = await createDevice(t, c);
    expect(d.status).toBe('never');
    await t.deps.db.system.update(devices).set({ lastSeenAt: new Date(t.clock.now().getTime() - 2 * 60_000) }).where(eq(devices.id, d.id));
    expect((await call(t, 'GET', url(`/devices/${d.id}`), { token: c.token })).body.status).toBe('online');
    // 11 minutes later: offline (threshold 10 min), access token still valid (15 min).
    await t.clock.travel(11 * 60_000, async () => {
      expect((await call(t, 'GET', url(`/devices/${d.id}`), { token: c.token })).body.status).toBe('offline');
    });
  });
});

describe('audit log', () => {
  it('records device linking and other sensitive actions with the actor', async () => {
    const v = await createVehicle(t, c);
    const d = await createDevice(t, c);
    await call(t, 'POST', url(`/devices/${d.id}/link`), { token: c.token, body: { vehicleId: v.id } });
    const log = await call(t, 'GET', url('/audit-log?limit=5'), { token: c.token });
    expect(log.body[0]).toMatchObject({
      action: 'device.linked',
      targetType: 'device',
      targetId: d.id,
      actor: { id: c.me.id },
      metadata: { imei: d.imei, vehicleId: v.id },
    });
    const actions = new Set(
      (await call(t, 'GET', url('/audit-log?limit=200'), { token: c.token })).body.map((e: any) => e.action),
    );
    for (const a of ['org.created', 'vehicle.created', 'vehicle.updated', 'vehicle.archived', 'device.created', 'device.unlinked', 'device.archived']) {
      expect(actions).toContain(a);
    }
  });
});
