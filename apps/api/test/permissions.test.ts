import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  call,
  createDevice,
  createVehicle,
  invitationToken,
  login,
  makeApp,
  newImei,
  randomPlate,
  signup,
  uniqueEmail,
  type Client,
  type TestCtx,
} from './helpers';

let t: TestCtx;
let owner: Client;
let manager: Client;
let viewer: Client;
let vehicleId: string;
let deviceId: string;

beforeAll(async () => {
  t = await makeApp();
  owner = await signup(t, { orgName: 'Agence Roles' });
  manager = await addMember(t, owner, 'manager');
  viewer = await addMember(t, owner, 'viewer');
  vehicleId = (await createVehicle(t, owner)).id;
  deviceId = (await createDevice(t, owner)).id;
});
afterAll(() => t.close());

type Role = 'owner' | 'manager' | 'viewer';
interface Case {
  name: string;
  allowed: Role[];
  run: (c: Client) => Promise<{ status: number }>;
}

const o = () => owner.orgId;
const cases: Case[] = [
  { name: 'read org', allowed: ['owner', 'manager', 'viewer'], run: (c) => call(t, 'GET', `/orgs/${o()}`, { token: c.token }) },
  { name: 'update org', allowed: ['owner'], run: (c) => call(t, 'PATCH', `/orgs/${o()}`, { token: c.token, body: { name: 'Agence Roles' } }) },
  { name: 'list members', allowed: ['owner', 'manager'], run: (c) => call(t, 'GET', `/orgs/${o()}/members`, { token: c.token }) },
  {
    name: 'invite member',
    allowed: ['owner'],
    run: (c) => call(t, 'POST', `/orgs/${o()}/invitations`, { token: c.token, body: { email: uniqueEmail(), role: 'viewer' } }),
  },
  { name: 'read audit log', allowed: ['owner', 'manager'], run: (c) => call(t, 'GET', `/orgs/${o()}/audit-log`, { token: c.token }) },
  { name: 'list vehicles', allowed: ['owner', 'manager', 'viewer'], run: (c) => call(t, 'GET', `/orgs/${o()}/vehicles`, { token: c.token }) },
  { name: 'get vehicle', allowed: ['owner', 'manager', 'viewer'], run: (c) => call(t, 'GET', `/orgs/${o()}/vehicles/${vehicleId}`, { token: c.token }) },
  {
    name: 'create vehicle',
    allowed: ['owner', 'manager'],
    run: (c) => call(t, 'POST', `/orgs/${o()}/vehicles`, { token: c.token, body: { type: 'scooter', name: 'S', plate: randomPlate() } }),
  },
  {
    name: 'update vehicle',
    allowed: ['owner', 'manager'],
    run: (c) => call(t, 'PATCH', `/orgs/${o()}/vehicles/${vehicleId}`, { token: c.token, body: { color: 'Blanc' } }),
  },
  { name: 'list devices', allowed: ['owner', 'manager', 'viewer'], run: (c) => call(t, 'GET', `/orgs/${o()}/devices`, { token: c.token }) },
  {
    name: 'create device',
    allowed: ['owner', 'manager'],
    run: (c) => call(t, 'POST', `/orgs/${o()}/devices`, { token: c.token, body: { imei: newImei() } }),
  },
  {
    name: 'update device',
    allowed: ['owner', 'manager'],
    run: (c) => call(t, 'PATCH', `/orgs/${o()}/devices/${deviceId}`, { token: c.token, body: { label: 'x' } }),
  },
  {
    name: 'unlink device',
    allowed: ['owner', 'manager'],
    run: (c) => call(t, 'POST', `/orgs/${o()}/devices/${deviceId}/unlink`, { token: c.token }),
  },
];

describe('role matrix', () => {
  for (const role of ['owner', 'manager', 'viewer'] as const) {
    for (const c of cases) {
      const allowed = c.allowed.includes(role);
      it(`${role} ${allowed ? 'can' : 'cannot'} ${c.name}`, async () => {
        const client = { owner, manager, viewer }[role];
        const r = await c.run(client);
        if (allowed) expect(r.status).toBeLessThan(300);
        else expect(r.status).toBe(403);
      });
    }
  }

  it('viewer cannot archive, link or change roles', async () => {
    expect((await call(t, 'POST', `/orgs/${o()}/vehicles/${vehicleId}/archive`, { token: viewer.token })).status).toBe(403);
    expect(
      (await call(t, 'POST', `/orgs/${o()}/devices/${deviceId}/link`, { token: viewer.token, body: { vehicleId } })).status,
    ).toBe(403);
    expect(
      (await call(t, 'PATCH', `/orgs/${o()}/members/${viewer.me.id}`, { token: viewer.token, body: { role: 'owner' } })).status,
    ).toBe(403);
  });

  it('manager cannot promote themself', async () => {
    const r = await call(t, 'PATCH', `/orgs/${o()}/members/${manager.me.id}`, { token: manager.token, body: { role: 'owner' } });
    expect(r.status).toBe(403);
  });
});

describe('members and invitations', () => {
  it('an invited new user joins only the inviting organization', async () => {
    expect(viewer.me.memberships).toHaveLength(1);
    expect(viewer.me.memberships[0]).toMatchObject({ orgId: owner.orgId, role: 'viewer' });
  });

  it('an existing user can accept an invitation sent to their email', async () => {
    const other = await signup(t, { orgName: 'Autre' });
    await call(t, 'POST', `/orgs/${o()}/invitations`, { token: owner.token, body: { email: other.email, role: 'manager' } });
    const token = invitationToken(t, other.email);
    const r = await call(t, 'POST', '/invitations/accept', { token: other.token, body: { token } });
    expect(r.status).toBe(200);
    const me = await login(t, other.email);
    expect(me.me.memberships.map((m) => m.role).sort()).toEqual(['manager', 'owner']);
    // Single use.
    expect((await call(t, 'POST', '/invitations/accept', { token: other.token, body: { token } })).body.code).toBe('invitation.invalid');
  });

  it('rejects an invitation used by a different email', async () => {
    const target = uniqueEmail();
    await call(t, 'POST', `/orgs/${o()}/invitations`, { token: owner.token, body: { email: target, role: 'viewer' } });
    const token = invitationToken(t, target);
    const intruder = await signup(t);
    const r = await call(t, 'POST', '/invitations/accept', { token: intruder.token, body: { token } });
    expect(r.body.code).toBe('invitation.email_mismatch');
  });

  it('rejects revoked and expired invitations', async () => {
    const a = uniqueEmail();
    const inv = await call(t, 'POST', `/orgs/${o()}/invitations`, { token: owner.token, body: { email: a, role: 'viewer' } });
    const tokenA = invitationToken(t, a);
    expect((await call(t, 'DELETE', `/orgs/${o()}/invitations/${inv.body.id}`, { token: owner.token })).status).toBe(204);
    await expect(signup(t, { email: a, invitationToken: tokenA })).rejects.toThrow(/invitation.invalid/);

    const b = uniqueEmail();
    await call(t, 'POST', `/orgs/${o()}/invitations`, { token: owner.token, body: { email: b, role: 'viewer' } });
    const tokenB = invitationToken(t, b);
    await t.clock.travel(8 * 86_400_000, () =>
      expect(signup(t, { email: b, invitationToken: tokenB })).rejects.toThrow(/invitation.invalid/),
    );
  });

  it('refuses to invite an existing member', async () => {
    const r = await call(t, 'POST', `/orgs/${o()}/invitations`, { token: owner.token, body: { email: viewer.email, role: 'viewer' } });
    expect(r.body.code).toBe('invitation.already_member');
  });

  it('keeps at least one owner', async () => {
    const solo = await signup(t);
    const demote = await call(t, 'PATCH', `/orgs/${solo.orgId}/members/${solo.me.id}`, { token: solo.token, body: { role: 'viewer' } });
    expect(demote.body.code).toBe('last_owner');
    const remove = await call(t, 'DELETE', `/orgs/${solo.orgId}/members/${solo.me.id}`, { token: solo.token });
    expect(remove.body.code).toBe('last_owner');
  });

  it('a removed member loses access immediately', async () => {
    const tmp = await addMember(t, owner, 'viewer');
    expect((await call(t, 'GET', `/orgs/${o()}/vehicles`, { token: tmp.token })).status).toBe(200);
    expect((await call(t, 'DELETE', `/orgs/${o()}/members/${tmp.me.id}`, { token: owner.token })).status).toBe(204);
    expect((await call(t, 'GET', `/orgs/${o()}/vehicles`, { token: tmp.token })).status).toBe(404);
  });

  it('role changes take effect on the next request and are audited', async () => {
    const tmp = await addMember(t, owner, 'viewer');
    const body = { type: 'car', name: 'Promo', plate: randomPlate() };
    expect((await call(t, 'POST', `/orgs/${o()}/vehicles`, { token: tmp.token, body })).status).toBe(403);
    await call(t, 'PATCH', `/orgs/${o()}/members/${tmp.me.id}`, { token: owner.token, body: { role: 'manager' } });
    expect((await call(t, 'POST', `/orgs/${o()}/vehicles`, { token: tmp.token, body })).status).toBe(201);
    const log = await call(t, 'GET', `/orgs/${o()}/audit-log`, { token: owner.token });
    expect(log.body.find((e: any) => e.action === 'member.role_changed' && e.targetId === tmp.me.id)).toMatchObject({
      metadata: { from: 'viewer', to: 'manager' },
    });
  });
});
