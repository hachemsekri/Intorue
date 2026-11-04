# Security and privacy notes

## Authentication
- Passwords: argon2id (19 MiB, t=2), at least 10 characters with a letter and a digit, at most 128.
- Access token: HS256 JWT, 15 minutes, bound to the user's password version, so **a password change or reset invalidates it at once**.
- Refresh token: 32 random bytes, stored as SHA-256, 30 days, **rotated on every use**. Reusing a rotated token revokes the whole token family.
- Web: tokens in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production). The refresh cookie is scoped to `/api/auth`. Cookie-authenticated writes must send `x-winou-csrf`.
- Mobile (Milestone 4): `Authorization: Bearer`, refresh token in the device's secure storage.
- Password reset: single-use link valid 30 minutes. The response is the same whether or not the email exists. All sessions end after a reset.
- Failed logins are audited. An account is locked for 15 minutes after 5 failures. Per-IP limits apply on all auth routes.

## Authorization and data separation
1. **AuthGuard** (global): every route needs a user unless marked `@Public()`.
2. **OrgGuard** (global): any route with `:orgId` requires membership; otherwise **404**, so other organizations are never confirmed. It then checks `@RequirePermission`, answering **403** if missing. A route without a declared permission throws (fails closed).
3. **PostgreSQL Row-Level Security**: org-scoped work runs as role `winou_app` with `app.org_id` set for the transaction. Policies restrict every tenant table to that org, for both reads and writes.
4. Composite foreign keys `(org_id, id)` make it impossible to link a device to another org's vehicle.
5. The audit log is append-only for the application role (no UPDATE or DELETE grant).

Production note: the API must connect as a **non-superuser** role that owns the tables and is granted `winou_app`, so that RLS stays active inside tenant transactions.

## Device data and live updates
- `POST /api/ingest/traccar` is for the device gateway only. It needs the `x-ingest-secret` header (constant-time comparison) and is disabled when `INGEST_SECRET` is unset. In production, expose it only on the internal network between Traccar and the API.
- A fix is attributed to an organization **only through the IMEI** of a registered, active device. Unknown IMEIs are counted and ignored, never auto-registered.
- Positions and live state are written in system context and are **read-only** for the application role. RLS restricts reads to the current organization.
- Live WebSocket: the browser gets a 60-second, single-use ticket from an authenticated, permission-checked endpoint and sends it as the **first message** (not in the URL). The socket carries only that organization's events (org-scoped bus plus a second check). Membership is rechecked every minute. Foreign browser origins are refused. Messages over 4 KB are rejected.

## Alerts, rules and zones
- Rules and zones are read by every member, changed only by owners and managers (`alerts.configure`); alerts are marked handled by owners and managers (`alerts.handle`). Viewers are read-only.
- A rule can only reference zones and vehicles of its own organization (checked inside the RLS transaction, so other organizations' IDs are simply not found).
- Alerts are created by the engine in system context and are only readable and markable as handled by the application role; they cannot be deleted. Rule and zone changes and "handled" actions are in the audit log.

## Input and transport
- Every body and query is validated with strict Zod schemas (unknown fields are rejected). IDs must be UUIDs, otherwise 404.
- Body size is limited to 256 KB. Helmet headers are on the API; the web app sets frame, sniffing, referrer and permissions policies.
- CORS is closed by default; the web app is same-origin through its proxy.
- Errors never return stack traces or SQL. Clients get a stable `code`.

## Secrets
- Only in environment variables. `.env` is git-ignored; `.env.example` has placeholders only.
- The demo password in `apps/api/src/scripts/seed.ts` is for local demo accounts only, and the seed refuses to run in production.

## Privacy
- Location data is never sold or shared. No analytics or third-party SDK receives location data.
- Retention is configurable per organization. Positions older than the setting are deleted every hour.
- There are no device commands, and no engine cut-off.

## Known gaps (planned)
- Rate limits and the live event bus are per process (memory). Redis is needed before running several API instances.
- No email verification at sign-up yet. To be added with the production SMTP provider.
- No 2FA yet. Recommended for owners of business accounts.
