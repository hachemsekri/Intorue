import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, cookiesFrom, login, makeApp, PASSWORD, signup, uniqueEmail, type TestCtx } from './helpers';

let t: TestCtx;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(() => t.close());

describe('sign-up', () => {
  it('creates a personal account with its own organization and sets httpOnly cookies', async () => {
    const email = uniqueEmail();
    const r = await call(t, 'POST', '/auth/signup', {
      body: { email, password: PASSWORD, name: 'Amira', accountKind: 'personal', acceptTerms: true },
    });
    expect(r.status).toBe(201);
    expect(r.body.memberships).toHaveLength(1);
    expect(r.body.memberships[0]).toMatchObject({ orgKind: 'personal', role: 'owner', orgName: 'Amira' });
    const access = r.res.cookies.find((c) => c.name === 'winou_at')!;
    const refresh = r.res.cookies.find((c) => c.name === 'winou_rt')!;
    expect(access.httpOnly).toBe(true);
    expect(access.sameSite).toBe('Lax');
    expect(refresh.path).toBe('/api/auth');
    expect(r.body).not.toHaveProperty('passwordHash');
  });

  it('creates a business account named after the company', async () => {
    const c = await signup(t, { kind: 'business', orgName: 'Livraisons Sfax' });
    expect(c.me.memberships[0]).toMatchObject({ orgKind: 'business', orgName: 'Livraisons Sfax', role: 'owner' });
  });

  it('normalizes email and rejects duplicates', async () => {
    const email = uniqueEmail();
    await signup(t, { email });
    const r = await call(t, 'POST', '/auth/signup', {
      body: { email: email.toUpperCase(), password: PASSWORD, name: 'X', accountKind: 'personal', acceptTerms: true },
    });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('email_taken');
  });

  it('validates input: weak password, missing terms, unknown fields', async () => {
    const weak = await call(t, 'POST', '/auth/signup', {
      body: { email: uniqueEmail(), password: 'short', name: 'X', acceptTerms: true },
    });
    expect(weak.status).toBe(400);
    expect(weak.body.issues.map((i: any) => i.code)).toContain('password.too_short');

    const noTerms = await call(t, 'POST', '/auth/signup', {
      body: { email: uniqueEmail(), password: PASSWORD, name: 'X', accountKind: 'personal', acceptTerms: false },
    });
    expect(noTerms.status).toBe(400);

    const extra = await call(t, 'POST', '/auth/signup', {
      body: { email: uniqueEmail(), password: PASSWORD, name: 'X', acceptTerms: true, accountKind: 'personal', isAdmin: true },
    });
    expect(extra.status).toBe(400);
  });
});

describe('sign-in', () => {
  it('rejects wrong passwords and unknown users with the same error', async () => {
    const c = await signup(t);
    const wrong = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: 'nope-nope-1' } });
    const unknown = await call(t, 'POST', '/auth/login', { body: { email: uniqueEmail(), password: 'nope-nope-1' } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('invalid_credentials');
    expect(unknown.body.code).toBe('invalid_credentials');
  });

  it('locks an account for a while after repeated failures', async () => {
    const c = await signup(t);
    for (let i = 0; i < 5; i++) {
      await call(t, 'POST', '/auth/login', { body: { email: c.email, password: 'bad-password-1' } });
    }
    const locked = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD } });
    expect(locked.status).toBe(429);
  });

  it('requires authentication on private routes', async () => {
    expect((await call(t, 'GET', '/auth/me')).status).toBe(401);
    expect((await call(t, 'GET', '/orgs')).status).toBe(401);
    expect((await call(t, 'GET', '/auth/me', { token: 'not-a-jwt' })).status).toBe(401);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const c = await signup(t);
    const r = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD } });
    const cookies = cookiesFrom(r.res);
    expect((await call(t, 'GET', '/auth/me', { cookies })).status).toBe(200);
    const body = { type: 'car', name: 'Clio', plate: '12 TUN 345' };
    const noCsrf = await call(t, 'POST', `/orgs/${c.orgId}/vehicles`, { cookies, body });
    expect(noCsrf.status).toBe(403);
    const withCsrf = await call(t, 'POST', `/orgs/${c.orgId}/vehicles`, { cookies, body, headers: { 'x-winou-csrf': '1' } });
    expect(withCsrf.status).toBe(201);
  });
});

describe('refresh tokens', () => {
  it('rotates, and reuse of an old token revokes the whole session family', async () => {
    const c = await signup(t);
    const l = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD, client: 'mobile' } });
    const first = l.body.refreshToken;
    const r1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: first } });
    expect(r1.status).toBe(200);
    const second = r1.body.refreshToken;
    expect(second).not.toBe(first);

    const reuse = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: first } });
    expect(reuse.status).toBe(401);
    // The legitimate newer token is now revoked too.
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: second } })).status).toBe(401);
  });

  it('expires after the configured lifetime', async () => {
    const c = await signup(t);
    const l = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD, client: 'mobile' } });
    await t.clock.travel(31 * 86_400_000, async () => {
      expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: l.body.refreshToken } })).status).toBe(401);
      expect((await call(t, 'GET', '/auth/me', { token: l.body.accessToken })).status).toBe(401);
    });
  });

  it('logout revokes the refresh token', async () => {
    const c = await signup(t);
    const l = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD, client: 'mobile' } });
    expect((await call(t, 'POST', '/auth/logout', { body: { refreshToken: l.body.refreshToken } })).status).toBe(204);
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: l.body.refreshToken } })).status).toBe(401);
  });
});

describe('password reset', () => {
  it('emails a single-use link, changes the password and ends existing sessions', async () => {
    const c = await signup(t);
    const l = await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD, client: 'mobile' } });

    expect((await call(t, 'POST', '/auth/forgot-password', { body: { email: c.email } })).status).toBe(204);
    const mail = t.mailer.last(c.email)!;
    const token = decodeURIComponent(mail.text.match(/token=([\w%-]+)/)![1]!);

    const newPassword = 'BrandNewPass99';
    expect((await call(t, 'POST', '/auth/reset-password', { body: { token, password: newPassword } })).status).toBe(204);
    expect((await call(t, 'POST', '/auth/reset-password', { body: { token, password: 'AnotherPass77' } })).body.code).toBe(
      'reset.invalid',
    );

    expect((await call(t, 'GET', '/auth/me', { token: l.body.accessToken })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: l.body.refreshToken } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/login', { body: { email: c.email, password: PASSWORD } })).status).toBe(401);
    await expect(login(t, c.email, newPassword)).resolves.toBeTruthy();
  });

  it('does not reveal whether an account exists', async () => {
    const before = t.mailer.sent.length;
    const r = await call(t, 'POST', '/auth/forgot-password', { body: { email: uniqueEmail('ghost') } });
    expect(r.status).toBe(204);
    expect(t.mailer.sent.length).toBe(before);
  });

  it('expires reset links after 30 minutes', async () => {
    const c = await signup(t);
    await call(t, 'POST', '/auth/forgot-password', { body: { email: c.email } });
    const token = decodeURIComponent(t.mailer.last(c.email)!.text.match(/token=([\w%-]+)/)![1]!);
    const r = await t.clock.travel(31 * 60_000, () =>
      call(t, 'POST', '/auth/reset-password', { body: { token, password: 'BrandNewPass99' } }),
    );
    expect(r.body.code).toBe('reset.invalid');
  });
});

describe('rate limiting', () => {
  it('limits sign-in attempts per IP', async () => {
    const strict = await makeApp({ RATE_LIMIT_AUTH_PER_MIN: '3' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push((await call(strict, 'POST', '/auth/login', { body: { email: uniqueEmail(), password: 'x' } })).status);
      }
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
      expect(codes.slice(3)).toEqual([429, 429]);
    } finally {
      await strict.close();
    }
  });
});
