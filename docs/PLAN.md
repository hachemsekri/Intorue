# Winou (working name): architecture plan v0

Status: **draft for approval**. No code yet. Date: 2026-11-04.

---

## 0. Current state (inspected)

- Project folder: empty. Nothing to preserve.
- Designs (4 PNGs): Live map (web), Trip history (web), Alerts (web), Mobile map with bottom sheet.
- Machine: Node 24, npm 11, git 2.56. **Docker is not installed** and pnpm is not enabled.

### What we keep from the designs, and what we change

| Keep | Change |
|---|---|
| Navy sidebar, turquoise accent, white cards, light grey background | Brand "Karia Track" becomes the configurable brand name (`packages/config/brand.ts`) |
| Fleet list + map + floating details card | Rental-only fields (Client, Contrat, Retour prévu, "En retard", "En location / Disponibles", "Contrats Karia" menu) are removed from the core. They come back only as an optional panel that the Karia integration fills in (M5) |
| KPI tiles, filter chips (Tous / Voitures / Motos / Trottinettes) | Core statuses become: **En mouvement**, **À l'arrêt**, **Hors ligne**, **Jamais connecté** |
| Trip page: KPI tiles, route, timeline (*Chronologie*) | "Mouvement sans contrat" becomes the generic **Mouvement hors horaires autorisés** rule |
| Alerts inbox: À traiter / Traitées / Réglages, Urgent / À vérifier badges, "Voir sur la carte" / "Marquer traitée" | "Vidange bientôt due" (maintenance) is out of v1 scope, noted for later |
| Mobile: map, bottom sheet, tabs Carte / Flotte / Alertes / Compte | The "Plan / Satellite" toggle stays hidden until we license a satellite provider |

Status colours: turquoise = moving, blue-slate = stopped, grey = offline, orange = needs attention, red = urgent alert. Each status also gets an icon and a text label, so colour is never the only signal.

---

## 1. Stack review

The proposed stack is sound. My choices, with three additions:

| Area | Choice | Notes |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo**, TypeScript strict | pnpm is enabled through Corepack, so nothing needs a global install |
| API | **NestJS** (Fastify adapter) | Guards and interceptors fit org-level authorization well. Built-in WebSocket gateway |
| DB | **PostgreSQL 16 + PostGIS** | `positions` table partitioned by month. Retention is enforced by dropping old partitions, which is cheap and reliable |
| ORM | **Drizzle** + raw SQL for PostGIS queries | *Change from the default:* Prisma handles PostGIS geometry poorly |
| Tenant isolation | App-level guards **plus Postgres Row-Level Security** (`SET LOCAL app.org_id` per request) | Two layers of protection, so a missed `WHERE` cannot leak data |
| Jobs / pub-sub | **Redis + BullMQ** | *Addition:* alert evaluation, trip detection, push sending, offline checks, rate-limit store, and fan-out of the Socket.IO adapter |
| Live updates | Socket.IO (WebSocket transport), one room per org | Clients authenticate on connect. Room membership is checked server-side |
| Web | **Next.js (App Router) + React**, Tailwind with logical properties (`ms-`/`me-`) for RTL, next-intl | |
| Mobile | **Expo (React Native)**, expo-router, i18next, **@maplibre/maplibre-react-native** | MapLibre native needs an Expo **development build**, not Expo Go |
| Maps | **MapLibre GL JS**, behind a `MapProvider` config (style URL, attribution, satellite on/off) | See §6 |
| Devices | **Traccar** (Docker) used only to decode, behind `DeviceGateway` adapter | See §3 |
| Email (dev) | **Mailpit** in Docker | *Addition:* catches password-reset emails locally. Production SMTP is TBD |
| Validation | **Zod** schemas in `packages/shared`, used by API, web and mobile | |
| Tests | Vitest (unit), API integration tests against a real Postgres (Testcontainers or the compose DB), Playwright smoke test for web | |

---

## 2. Repository layout

```
apps/
  api/          NestJS: REST + WebSocket + workers
  web/          Next.js
  mobile/       Expo
  simulator/    Node CLI: fake devices -> Traccar (OsmAnd protocol)
packages/
  shared/       types, Zod schemas, enums, plate formats, unit helpers
  config/       brand, map providers, feature flags
  i18n/         fr (default), ar, en catalogs
  ui-tokens/    colours, spacing, typography shared by web and mobile
infra/
  docker-compose.yml   postgres+postgis, redis, traccar, mailpit, (tiles)
  traccar/traccar.xml
docs/
  PLAN.md  ASSUMPTIONS.md  MAP_SERVICES.md  LEGAL_REVIEW.md  SECURITY.md
```

---

## 3. Device data flow (Traccar behind an adapter)

```
GPS device ──TCP/UDP──▶ Traccar ──HTTP forward (JSON)──▶ API /ingest/traccar  (shared secret, internal network only)
Simulator ──OsmAnd HTTP──▶ Traccar ─┘                         │
                                                              ▼
                                              TraccarAdapter.normalize() -> DevicePosition (our type)
                                                              ▼
                                   PositionService: resolve IMEI -> device -> vehicle -> org
                                   store position, update live state, publish to Redis
                                          │                   │                    │
                                   WebSocket push       Alert evaluator        Trip detector
```

- `DeviceGateway` interface: `registerDevice(imei)`, `removeDevice(imei)`, `normalizePosition(raw)`, `normalizeEvent(raw)`. `TraccarGateway` is the only implementation that knows Traccar. Traccar's reports, geofences and notifications are **not** used.
- The simulator speaks the OsmAnd protocol to Traccar's port 5055, so simulated data takes the **same path** as real data from that point on.
- Unit normalization happens in the adapter: Traccar knots become km/h, timestamps become UTC, battery becomes a percentage when available.
- Unknown IMEIs are dropped and counted, never auto-attached to an org.
- **No command endpoints exist.** The adapter has no `sendCommand`. The Traccar API user has read-only rights where possible, and command ports are not exposed. Engine cut-off is excluded by design.

---

## 4. Data model (v1)

All tenant tables carry `org_id` and are covered by RLS. Timestamps are stored in UTC and displayed in Africa/Tunis.

| Table | Key fields |
|---|---|
| `users` | id, email (unique), password_hash (argon2id), name, locale, phone?, email_verified_at, disabled_at |
| `organizations` | id, name, kind `personal\|business`, timezone (default Africa/Tunis), location_retention_days, created_at |
| `memberships` | user_id, org_id, role `owner\|manager\|viewer`. A user can belong to several orgs |
| `invitations` | org_id, email, role, token_hash, expires_at |
| `refresh_tokens` / `password_reset_tokens` | hashed tokens, expiry, revoked_at, user agent |
| `vehicles` | org_id, type `car\|motorcycle\|scooter`, name, make, model, plate, plate_format, colour, speed_limit_kmh?, archived_at |
| `devices` | org_id, imei (globally unique), model?, protocol?, gateway_ref, last_seen_at, battery_pct?, archived_at |
| `device_assignments` | device_id, vehicle_id, from, to. History is kept so trips stay attributed correctly. Partial unique index enforces one active assignment per device and per vehicle |
| `positions` (partitioned monthly) | org_id, device_id, vehicle_id, recorded_at, received_at, geom Point(4326), speed_kmh, heading, altitude, satellites, ignition?, battery_pct?, attrs jsonb, source `device\|simulator` |
| `vehicle_live_state` | vehicle_id PK, last position, status, moving_since/stopped_since |
| `trips` | org_id, vehicle_id, started_at, ended_at, start/end geom, distance_m, duration_s, max_speed_kmh, avg_speed_kmh, path LineString (simplified) |
| `stops` | org_id, vehicle_id, started_at, ended_at, geom, duration_s |
| `geofences` | org_id, name, geom Polygon (circles stored as buffered polygons and keep their radius metadata) |
| `alert_rules` | org_id, type `movement_schedule\|geofence_exit\|geofence_enter\|speeding\|device_offline\|low_battery`, params jsonb (Zod-validated), scope (all or vehicle ids), schedule, severity, enabled |
| `alerts` | org_id, rule_id, vehicle_id, type, severity, occurred_at, geom, payload, status `open\|handled`, handled_by, handled_at, note. Dedup key prevents alert storms |
| `push_tokens` | user_id, platform, expo_token, last_used_at |
| `audit_log` | org_id, actor_user_id, action, target_type/id, metadata, ip, at. Append-only |
| `consents` | user_id, document_key, version, accepted_at |
| `place_names` | GeoNames Tunisia localities, used for offline reverse geocoding ("Hammamet", "Lafayette, Tunis") |
| *(M5)* `api_clients`, `external_refs` | Karia API keys (hashed, scoped to an org) and external IDs mapping |

**Trip detection** is our own, device-agnostic and incremental. A trip starts when ignition is on, or when speed is above 5 km/h for at least 2 consecutive fixes or 60 s. It ends after 5 minutes stationary (configurable). GPS jitter is filtered by an accuracy check and a minimum distance. Pure functions make it unit-testable with recorded tracks.

---

## 5. Security & privacy

- Every route is denied by default. A global `AuthGuard` and `OrgGuard` resolve membership and role, and `@Roles()` sets requirements per endpoint. RLS acts as a second wall. Automated tests try to read and write every resource across orgs and must get 404.
- Passwords use argon2id. Access JWTs last 15 minutes. Refresh tokens rotate, are stored hashed, sit in httpOnly SameSite cookies on web and in SecureStore on mobile, and are reused-token detected.
- Reset links are single-use and expire in 30 minutes. The response is the same whether or not the email exists.
- Rate limits (Redis): login, reset, invitation accept, ingest, and every public endpoint. Helmet, a strict CORS allowlist, and a body size limit are applied.
- The audit log covers: sign-in failures and lockouts, member and role changes, device link and unlink, alert rule and geofence changes, vehicle archive, retention change, data export.
- Retention: `organizations.location_retention_days` (default **90**, assumption). A nightly job deletes older positions and trips and drops whole partitions when possible.
- Secrets live only in `.env` (git-ignored). `.env.example` contains placeholders.
- No analytics or third-party SDKs that receive location. Location data is never sold or shared (stated in docs, enforced by having no such integrations).

---

## 6. Maps & data services

The provider is selected in `packages/config/maps.ts` by env (`MAP_PROVIDER=protomaps-local|maptiler|…`).

| Service | Use | License / attribution | Cost | Status |
|---|---|---|---|---|
| OpenStreetMap data | base map data | ODbL, "© OpenStreetMap contributors" | free | v1 |
| Protomaps basemap (PMTiles extract of Tunisia, self-hosted) | dev + candidate prod tiles | BSD/ODbL. Data © OSM, styles © Protomaps | free (own hosting) | **dev default, needs your OK to download** |
| MapLibre GL JS / MapLibre Native | rendering | BSD-3 | free | v1 |
| GeoNames Tunisia dump | reverse geocoding (nearest place) | CC-BY 4.0, attribution required | free | v1 |
| Traccar | device decoding | Apache 2.0 | free (self-hosted) | v1 |
| Expo Push Service (via FCM / APNs) | push notifications | Expo ToS, Google/Apple terms | free tier. Apple dev account is $99/yr | M4, asks first |
| Satellite imagery | "Satellite" toggle | must be licensed (MapTiler, Esri, Mapbox…) | paid | **not in v1**, toggle hidden |

Not used: demo OSRM, public Nominatim or Photon, unlicensed imagery. Routing is not needed because we draw real GPS tracks. The full list lives in `docs/MAP_SERVICES.md`. Attribution is shown on every map, web and mobile.

---

## 7. i18n, locale, formats

- Supported locales: `fr` (default), `ar` (RTL), `en`. Web sets `dir="rtl"` per locale. Mobile uses `I18nManager.forceRTL` plus a reload prompt. CSS uses only logical properties.
- Dates and numbers use `Intl` with the `Africa/Tunis` zone, km, km/h and 24-hour time. Tunisia has had no DST since 2009, but we still rely on the time zone database rather than a fixed offset.
- Plates (`packages/shared/plates.ts`):
  - standard `NNN TUN NNNN` (1–3 digits, series, 1–4 digits). Stored normalized and displayed as "245 TUN 7812" in FR/EN and as "245 تونس 7812" in AR
  - `RS` (régime suspensif) `NNNNNN RS`
  - "Autre / non immatriculé" with free text, for scooters, diplomatic plates and others
  - *Assumption to verify:* exact motorcycle, diplomatic and temporary formats.

---

## 8. Milestones

Each milestone ends with: tests green, README updated, a "how to run" section, and a stop for your review.

**M1: Foundation, accounts, vehicles, devices**
Monorepo, Docker Compose (Postgres+PostGIS, Redis, Mailpit, Traccar), migrations, seed. Auth (sign-up, sign-in, refresh, sign-out, password reset by email), personal and business orgs, invitations, roles, RLS. CRUD and archive for vehicles. IMEI linking and unlinking with history. Device status (online/offline/never, last update). Audit log. Web shell in the design style: sidebar, FR/AR/EN switcher with RTL, responsive layout, and Vehicles and Devices pages.
*Tests:* role matrix, cross-org isolation for every endpoint, IMEI uniqueness, validation, rate limiting.

**M2: Simulator, location pipeline, live map**
Traccar forward, then adapter, ingest, positions, live state, then WebSocket. Simulator CLI with cars, motorcycles and scooters around Tunis on realistic routes, with stops, speeding, geofence exit and disconnects. `pnpm demo:seed` creates a clearly labelled **[DÉMO]** org. Live map page following the design: KPI tiles, search, type and status filters, list, markers, details card. Offline place names.
*Tests:* adapter normalization, IMEI resolution, WebSocket room isolation.

**M3: Trip history & alerts**
Trip and stop detection worker, trip page (route, distance, duration, top speed, timeline, date filter). Geofence editor, alert rules UI (Réglages des alertes), evaluator for all 6 rule types, alerts inbox with handled status, realtime badge.
*Tests:* trip detection on fixture tracks (jitter, short stops, missing data), every alert rule incl. schedule boundaries in Africa/Tunis, dedup.

**M4: Mobile app & push**
Expo app: sign-in, map with bottom sheet, fleet list, vehicle details, trips, alerts with "mark handled", account and locale. Push via Expo with per-user preferences. Dev build instructions for Android (and iOS if you have an Apple account).
*Tests:* push targeting respects org and role; component tests for key screens.

**M5: Karia integration API & real device**
Org-scoped API keys, read-only REST plus signed webhooks (positions, trips, alerts), `external_refs` for Karia vehicle and contract IDs. The optional rental panel on the details card appears only when the integration is enabled. Real device: confirm Traccar protocol support from your docs, configure the port, run a field test, record findings. Device support is called complete only after this.

---

## 9. Assumptions (also in `docs/ASSUMPTIONS.md`)

1. Sign-in uses email and password. Phone/SMS OTP is deferred because it costs money per SMS.
2. A personal account is an org of kind `personal` with one owner, so the same code path serves both.
3. Viewers are read-only and **cannot** mark alerts handled. Managers can do everything except members, org settings and deletion. Owners can do everything.
4. All staff in an org see all of its vehicles. Per-vehicle restrictions come later.
5. Default retention is 90 days and configurable per org (min 7, max 365, pending legal advice).
6. "Offline" means no data for 10 minutes. "Stopped" means speed below 3 km/h for 2 minutes. Both are configurable.
7. Speeding uses a per-vehicle limit or a per-rule threshold. There is no road speed-limit database in v1.
8. Low battery fires only when the device reports battery level (threshold 20% by default).
9. No billing or subscriptions in v1.
10. Simulator traffic is tagged `source=simulator` and shown with a **DÉMO** badge.

## 10. Items for a Tunisian lawyer (`docs/LEGAL_REVIEW.md`)

- Loi organique n° 2004-63 on personal data protection, and whether INPDP declaration or authorization is needed for geolocation processing
- Tracking employees (delivery staff) and rental customers: notice, consent, working-hours limits
- Retention periods for location data
- Terms of service, privacy policy, cookie/consent notices (placeholders only in v1)
- Data hosting location and cross-border transfer (where the servers will live)
- Rules for law-enforcement requests for location data
- Rules on GPS devices and SIM cards (import/approval, ANF/INT)

## 11. Open questions

**Blocks M1 setup:**
- **Docker Desktop** is needed (Postgres, Redis, Traccar). Can you install it? I will not install system software without asking.
- **Project folder:** this session currently uses a temporary folder. Choose where the repo should live.

**Needed later (not blocking now):**
- M2: OK to download the Protomaps Tunisia extract (~100–200 MB, free, ODbL) for local tiles?
- M4: Do you have an Apple developer account and a Firebase project, or should Android go first?
- M5: device model and protocol docs, Karia API contact.
- Production SMTP provider and hosting location (also a legal question).
