# Winou: GPS tracking platform (working name)

Track cars, motorcycles and scooters in Tunisia. Web app (French, Arabic RTL, English), mobile app (Milestone 4), API.
The brand name lives in one place: `packages/config/src/index.ts`.

> **Status: Milestone 1** (accounts, organizations, roles, vehicles, GPS devices, audit log).
> Live map, simulator, trips, alerts and mobile come in Milestones 2 to 4. See [docs/PLAN.md](docs/PLAN.md).

## Repository

```
apps/api        NestJS (Fastify) REST API: auth, organizations, vehicles, devices, audit log
apps/web        Next.js web app (proxies /api to the API so auth cookies stay first-party)
packages/shared Types, Zod validation schemas, roles/permissions, Tunisian plates, IMEI
packages/i18n   fr (default), ar (RTL), en messages
packages/config Brand name/colours, map provider registry
infra/          Docker Compose: PostgreSQL+PostGIS, Redis, Mailpit, Traccar
docs/           Plan, assumptions, map services, legal review list, security notes
```

## Requirements

- Node.js 22 or later (tested with 24)
- pnpm through Corepack, which ships with Node. Every command below uses `corepack pnpm …`, so no global install is needed.
- Docker Desktop: **optional for Milestone 1**, required from Milestone 2 (Traccar, PostGIS).

## First run

```bash
corepack pnpm install
```

```bash
cp .env.example .env
```

Then set `JWT_SECRET` in `.env` to a long random value:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```bash
corepack pnpm build:packages
```

```bash
corepack pnpm db:seed
```

```bash
corepack pnpm dev
```

- Web app: http://localhost:3000
- API: http://localhost:4000/api/health

### Without Docker (default in `.env.example`)

`DATABASE_URL=pglite:./.data/pglite` uses **PGlite**, real PostgreSQL compiled to run inside Node.
It is for local development and tests only. The API refuses to start with it when `NODE_ENV=production`.
PGlite allows only one process at a time, so **stop the API before running `db:seed`**.

Password-reset and invitation emails are printed in the API console when `SMTP_URL` is empty.

### With Docker

```bash
corepack pnpm infra:up
```

Then in `.env`:

```
DATABASE_URL=postgres://winou:winou_dev_only@localhost:5432/winou
SMTP_URL=smtp://localhost:1025
```

Emails then appear in Mailpit at http://localhost:8025.

## Demo data

`corepack pnpm db:seed` creates **sample data, clearly labelled `[DÉMO]`**:
a business organization with 6 vehicles (car, motorcycle, scooter) linked to simulated devices plus one spare device, and a personal account.
The demo accounts (owner, manager, viewer, personal) and their development-only password are listed at the top of
[apps/api/src/scripts/seed.ts](apps/api/src/scripts/seed.ts). Re-create the demo data with `corepack pnpm db:seed:reset`.
The seed refuses to run in production.

## Tests

```bash
corepack pnpm test
```

| Suite | What it proves |
|---|---|
| `apps/api/test/isolation.test.ts` | A member of org A gets **404** on every org-B route and on B's IDs through A's own org; Postgres Row-Level Security blocks reads and writes across orgs even without a `WHERE`; the audit log is append-only |
| `apps/api/test/permissions.test.ts` | Full owner / manager / viewer matrix; invitations (single use, expiry, email match, revoke); last-owner protection; removed members lose access immediately |
| `apps/api/test/auth.test.ts` | Sign-up, sign-in, lockout, CSRF on cookie writes, refresh-token rotation and reuse detection, password reset (single use, 30 min expiry, old sessions revoked), rate limiting |
| `apps/api/test/fleet.test.ts` | Tunisian plate parsing, duplicates, archive/restore, IMEI validation, one-device-per-vehicle linking, online/offline status, audit entries |
| `packages/shared/src/shared.test.ts` | Plates, IMEI Luhn, device status, permission matrix |

Tests run against PGlite by default. To run them against the Docker PostgreSQL, set `TEST_DATABASE_URL`.

## Useful commands

| Command | |
|---|---|
| `corepack pnpm dev` | Shared packages (watch), API and web together |
| `corepack pnpm dev:api` | API only |
| `corepack pnpm typecheck` | TypeScript across the repo |
| `corepack pnpm db:migrate` | Apply SQL migrations (`apps/api/src/migrations`) |
| `corepack pnpm infra:up` / `infra:down` | Start / stop Docker services |

## Security model (short)

- Every API route requires a signed-in user unless explicitly public. Every route with `:orgId` must declare a permission, and the guard fails closed when one is missing.
- Org-scoped queries run inside a transaction as the `winou_app` role with `app.org_id` set, so **PostgreSQL Row-Level Security** is a second wall behind the API checks.
- Passwords use argon2id. Access tokens last 15 minutes. Refresh tokens rotate and are stored hashed; reusing an old one revokes the whole session.
- Rate limits apply on sign-in, sign-up and reset, with temporary lockout after repeated failures.
- The audit log records sensitive actions (device linking, roles, archive…).
- There are **no commands to devices**. Engine cut-off is out of scope by design.

More detail: [docs/SECURITY.md](docs/SECURITY.md).

## Documents

- [docs/PLAN.md](docs/PLAN.md): architecture, data model, milestones
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): decisions taken without blocking questions
- [docs/MAP_SERVICES.md](docs/MAP_SERVICES.md): map and data services, licences, cost
- [docs/LEGAL_REVIEW.md](docs/LEGAL_REVIEW.md): items for a Tunisian lawyer
- [docs/SECURITY.md](docs/SECURITY.md): security and privacy notes
