import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, call, createDevice, createVehicle, makeApp, signup, type Client, type TestCtx } from './helpers';

const SECRET = 'test-ingest-secret-0123456789';
let t: TestCtx;
let owner: Client;
let manager: Client;
let viewer: Client;
let other: Client;
let imei: string;

const token = (n: string) => `ExponentPushToken[test-${n}-0123456789]`;
const register = (c: Client, tok: string, locale = 'fr') =>
  call(t, 'POST', '/me/push-tokens', { token: c.token, body: { token: tok, platform: 'android', locale } });

/** Drives the vehicle out of allowed hours (rule with no allowed window) to create one alert. */
async function triggerAlert(severity: 'urgent' | 'warning') {
  const rules = (await call(t, 'GET', `/orgs/${owner.orgId}/alert-rules`, { token: owner.token })).body as { id: string }[];
  for (const r of rules) await call(t, 'DELETE', `/orgs/${owner.orgId}/alert-rules/${r.id}`, { token: owner.token });
  await call(t, 'POST', `/orgs/${owner.orgId}/alert-rules`, { token: owner.token, body: { type: 'movement_schedule', name: 'Nuit', severity, params: { windows: [] } } });
  t.push.sent.length = 0;
  t.clock.advance(60_000);
  const r = await call(t, 'POST', '/ingest/traccar', {
    headers: { 'x-ingest-secret': SECRET },
    body: { position: { latitude: 36.8, longitude: 10.18, speed: 20, fixTime: t.clock.now().toISOString(), attributes: {} }, device: { uniqueId: imei } },
  });
  expect(r.body.accepted).toBe(1);
  return t.push.sent;
}

beforeAll(async () => {
  t = await makeApp({ INGEST_SECRET: SECRET, ACCESS_TOKEN_TTL_SECONDS: '86400' });
  owner = await signup(t, { orgName: 'Push A' });
  manager = await addMember(t, owner, 'manager');
  viewer = await addMember(t, owner, 'viewer');
  other = await signup(t, { orgName: 'Push B' });
  const v = await createVehicle(t, owner, '245 TUN 7812');
  const d = await createDevice(t, owner);
  imei = d.imei;
  await call(t, 'POST', `/orgs/${owner.orgId}/devices/${d.id}/link`, { token: owner.token, body: { vehicleId: v.id } });
  await register(owner, token('owner'));
  await register(manager, token('manager'), 'ar');
  await register(viewer, token('viewer'), 'en');
  await register(other, token('other'));
});
afterAll(() => t.close());
beforeEach(() => {
  t.push.invalid.clear();
});

describe('push tokens', () => {
  it('accepts only Expo push tokens and requires sign-in', async () => {
    expect((await register(owner, 'not-a-token')).status).toBe(400);
    expect((await call(t, 'POST', '/me/push-tokens', { body: { token: token('x'), platform: 'android' } })).status).toBe(401);
  });
});

describe('alert notifications', () => {
  it('reach every member of the organization, in their language, and nobody else', async () => {
    const sent = await triggerAlert('warning');
    expect(sent.map((m) => m.to).sort()).toEqual([token('manager'), token('owner'), token('viewer')].sort());
    expect(sent.find((m) => m.to === token('owner'))!.title).toContain('Mouvement hors horaires');
    expect(sent.find((m) => m.to === token('viewer'))!.title).toContain('Movement out of hours');
    expect(sent.find((m) => m.to === token('manager'))!.title).toContain('حركة خارج الأوقات');
    // No coordinates on the lock screen.
    for (const m of sent) expect(JSON.stringify(m)).not.toMatch(/36\.8|10\.18/);
    expect(sent[0]!.data).toMatchObject({ kind: 'alert', orgId: owner.orgId });
  });

  it('respect per-organization preferences (off, urgent only)', async () => {
    await call(t, 'PUT', `/orgs/${owner.orgId}/push-preferences`, { token: viewer.token, body: { enabled: false, urgentOnly: false } });
    await call(t, 'PUT', `/orgs/${owner.orgId}/push-preferences`, { token: manager.token, body: { enabled: true, urgentOnly: true } });
    expect((await triggerAlert('warning')).map((m) => m.to)).toEqual([token('owner')]);
    expect((await triggerAlert('urgent')).map((m) => m.to).sort()).toEqual([token('manager'), token('owner')].sort());
    const prefs = await call(t, 'GET', `/orgs/${owner.orgId}/push-preferences`, { token: manager.token });
    expect(prefs.body).toEqual({ enabled: true, urgentOnly: true });
    // Preferences of another organization cannot be read or set.
    expect((await call(t, 'GET', `/orgs/${owner.orgId}/push-preferences`, { token: other.token })).status).toBe(404);
    await call(t, 'PUT', `/orgs/${owner.orgId}/push-preferences`, { token: viewer.token, body: { enabled: true, urgentOnly: false } });
    await call(t, 'PUT', `/orgs/${owner.orgId}/push-preferences`, { token: manager.token, body: { enabled: true, urgentOnly: false } });
  });

  it('stop for removed members and signed-out phones', async () => {
    const tmp = await addMember(t, owner, 'viewer');
    await register(tmp, token('tmp'));
    expect((await triggerAlert('warning')).map((m) => m.to)).toContain(token('tmp'));
    await call(t, 'DELETE', `/orgs/${owner.orgId}/members/${tmp.me.id}`, { token: owner.token });
    expect((await triggerAlert('warning')).map((m) => m.to)).not.toContain(token('tmp'));

    await call(t, 'POST', '/me/push-tokens/remove', { token: viewer.token, body: { token: token('viewer') } });
    expect((await triggerAlert('warning')).map((m) => m.to)).not.toContain(token('viewer'));
    await register(viewer, token('viewer'), 'en');
  });

  it('a token moves to the account that registers it last', async () => {
    await register(other, token('shared'));
    await register(owner, token('shared'));
    expect((await triggerAlert('warning')).map((m) => m.to)).toContain(token('shared'));
    await register(other, token('shared'));
    expect((await triggerAlert('warning')).map((m) => m.to)).not.toContain(token('shared'));
  });

  it('forgets tokens the push service reports as no longer registered', async () => {
    t.push.invalid.add(token('owner'));
    await triggerAlert('warning');
    const rows = await t.deps.db.system.execute(sql`select 1 from push_tokens where token = ${token('owner')}`);
    expect(rows.rows).toHaveLength(0);
  });
});
