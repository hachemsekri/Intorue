# Winou: GPS tracking platform (working name)

Track cars, motorcycles and scooters in Tunisia. Web app (French, Arabic RTL, English), mobile app (Milestone 4), API.
The brand name lives in one place: `packages/config/src/index.ts`.

> **Status: Milestone 2** (accounts, organizations, roles, vehicles, GPS devices, audit log,
> device simulator, location data, live map). Trips and alerts come in Milestone 3, mobile in Milestone 4.
> See [docs/PLAN.md](docs/PLAN.md).

## Repository

```
apps/api        NestJS (Fastify) REST API: auth, organizations, vehicles, devices, audit log
apps/web        Next.js web app (proxies /api to the API so auth cookies stay first-party)
apps/simulator  Simulated GPS devices around Tunis (SAMPLE DATA), sent through the device adapter
packages/shared Types, Zod validation schemas, roles/permissions, Tunisian plates, IMEI
packages/i18n   fr (default), ar (RTL), en messages
packages/config Brand name/colours, map provider registry
infra/          Docker Compose: PostgreSQL+PostGIS, Redis, Mailpit, Traccar
docs/           Plan, assumptions, map services, legal review list, security notes
```

## Requirements

- Node.js 22 or later (tested with 24)
- pnpm through Corepack, which ships with Node. Every command below uses `corepack pnpm …`, so no global install is needed.
- Docker Desktop: **optional**. Without it, the project runs on PGlite (embedded PostgreSQL with PostGIS),
  in-memory live updates, and the simulator posting straight to the device adapter. A real GPS device test
  (Milestone 5) needs Traccar on a server reachable from the internet.

## First run

```bash
corepack pnpm install
```

```bash
cp .env.example .env
```

Then set `JWT_SECRET` and `INGEST_SECRET` in `.env` to long random values (run this twice):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start everything (local database, API, web app). Leave this terminal open:

```bash
corepack pnpm dev
```

- Web app: http://localhost:3000
- API: http://localhost:4000/api/health

In a **second terminal**, add the demo data (once), then start the simulated vehicles:

```bash
corepack pnpm db:seed
```

```bash
corepack pnpm sim
```

Simulator options: `--interval 5` (seconds between fixes), `--only 3,5` (some vehicles), `--once`.

**Map with streets** (one-off, about 10 minutes, 70 MB): downloads the Tunisia basemap to `apps/web/public/map/`.
Without it, the map shows vehicles on a plain background.

```bash
corepack pnpm basemap
```

### Without Docker (default in `.env.example`)

`corepack pnpm dev` first starts a local database server: **PGlite**, real PostgreSQL with PostGIS compiled to
WebAssembly, listening on `127.0.0.1:5433` and storing its data in `apps/api/.data/pglite`. It runs as its own
process so API restarts never touch the data folder, and it closes cleanly on Ctrl+C.
It is for local development only (one query at a time, so `DATABASE_POOL_MAX=1`).
The API refuses the in-process `pglite:` mode in production; the local server on port 5433 is for development only.

`corepack pnpm db:check` prints row counts, to check the local database opens correctly. If the data folder is ever
damaged (for example after the PC loses power), stop `dev`, delete `apps/api/.data/pglite`, start `dev` again and
re-run `db:seed`. The folder only holds local development data.

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
| `apps/api/test/live.test.ts` | Traccar adapter (knots to km/h, battery, invalid payloads), ingest secret, unknown IMEIs ignored, dedup, late/future fixes, moving/stopped, **live data separation** (API, RLS and WebSocket), WebSocket tickets (single-use, forged, foreign origin, removed member), retention deletion |
| `apps/simulator/src/engine.test.ts` | Scenarios stay around Tunis, plausible speeds, motorway speeding, stops, disconnections, battery drain, Traccar JSON format |
| `packages/shared/src/shared.test.ts` | Plates, IMEI Luhn, device status, permission matrix |

Tests run against PGlite by default. To run them against the Docker PostgreSQL, set `TEST_DATABASE_URL`.

## Useful commands

| Command | |
|---|---|
| `corepack pnpm dev` | Local database, shared packages (watch), API and web together |
| `corepack pnpm dev:api` | API only |
| `corepack pnpm sim` | Simulated vehicles ([DÉMO]) |
| `corepack pnpm db:check` | Check the local database opens, print row counts |
| `corepack pnpm basemap` | Download or extend the self-hosted Tunisia basemap |
| `corepack pnpm typecheck` | TypeScript across the repo |
| `corepack pnpm db:migrate` | Apply SQL migrations (`apps/api/src/migrations`) |
| `corepack pnpm infra:up` / `infra:down` | Start / stop Docker services |

## Security model (short)

- Every API route requires a signed-in user unless explicitly public. Every route with `:orgId` must declare a permission, and the guard fails closed when one is missing.
- Org-scoped queries run inside a transaction as the `winou_app` role with `app.org_id` set, so **PostgreSQL Row-Level Security** is a second wall behind the API checks.
- Passwords use argon2id. Access tokens last 15 minutes. Refresh tokens rotate and are stored hashed; reusing an old one revokes the whole session.
- Rate limits apply on sign-in, sign-up and reset, with temporary lockout after repeated failures.
- The audit log records sensitive actions (device linking, roles, archive…).
- Device data enters only through `POST /api/ingest/traccar`, protected by `INGEST_SECRET`. A fix is attributed to an organization only through the registered IMEI; unknown IMEIs are ignored.
- The live WebSocket opens with a single-use, 60-second ticket sent as the first message (never in the URL), carries only one organization's events, and rechecks membership every minute.
- There are **no commands to devices**. Engine cut-off is out of scope by design.

More detail: [docs/SECURITY.md](docs/SECURITY.md).

## Documents

- [docs/PLAN.md](docs/PLAN.md): architecture, data model, milestones
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): decisions taken without blocking questions
- [docs/MAP_SERVICES.md](docs/MAP_SERVICES.md): map and data services, licences, cost
- [docs/LEGAL_REVIEW.md](docs/LEGAL_REVIEW.md): items for a Tunisian lawyer
- [docs/SECURITY.md](docs/SECURITY.md): security and privacy notes
