# Assumptions

Decisions taken so work could continue. Each one can be changed. Ask if one is wrong.

## Product
1. **Sign-in uses email and password.** Phone/SMS one-time codes are deferred because SMS costs money per message.
2. **A personal account is an organization** of kind `personal` with one owner, so the same code serves individuals and businesses. A user can belong to several organizations and switch between them.
3. **Roles**
   - Owner: everything, including the team, settings and retention.
   - Manager: vehicles, devices, and later alerts and geofences; can read the team list and the audit log.
   - Viewer: read-only, and **cannot** mark alerts handled.
4. All members of an organization see all of its vehicles. Restricting staff to some vehicles comes later.
5. An organization must always keep at least one owner.
6. Invitations last 7 days and are single-use. The invited email must match the account that accepts it.
7. Signing up through an invitation joins only that organization; no personal organization is created.

## Data and devices
8. **Device ID = 8 to 20 digits** (spaces and dashes ignored). Usually the 15-digit IMEI, but the check digit is not enforced: labels are sometimes misprinted and some trackers report a shorter ID. A typo shows up as "never connected". To confirm with the real device model.
9. An IMEI can be active in only one organization. Archiving the device frees it.
10. One device per vehicle, and one vehicle per device. The link history is kept in `device_assignments`, so trips stay attributed to the right vehicle.
11. A device is **offline** after 10 minutes without data, and **never connected** before its first report.
12. Location history is kept **90 days by default**, configurable per organization between 7 and 365 days, pending legal advice. The API deletes older positions every hour.
13. Speeding in Milestone 3 uses a per-vehicle limit or a per-rule threshold. There is no road speed-limit database.

## Tunisia specifics
14. **Plate formats**
    - Standard: `NNN TUN NNNN` (1–3 digits, تونس, 1–4 digits). Stored in Latin form; in Arabic it is shown with تونس, reading right-to-left.
    - RS (régime suspensif): up to 6 digits + `RS`.
    - Everything else (diplomatic, government, temporary, unregistered scooters) is stored as typed under "Autre".
    - **To verify:** exact motorcycle, diplomatic and temporary formats.
15. Time zone: `Africa/Tunis`, 24-hour clock, km and km/h. Dates are stored in UTC.
16. The Arabic translations are a first pass and **need review by a native speaker** before launch.

## Technical
17. **PGlite** (PostgreSQL + PostGIS in WebAssembly) makes the project runnable and testable without Docker. Tests run it in-process; `corepack pnpm dev` runs it as a separate local server on port 5433, so API restarts cannot damage its data folder. Production must use PostgreSQL 16 with PostGIS; the API refuses PGlite in production.
18. Rate limits (and, from Milestone 2, live updates) are kept in memory for one API process. They move to Redis before running several API instances in production.
19. **Turborepo was dropped** in favour of `pnpm -r`, because pnpm cannot be installed globally on this PC without admin rights. Every command goes through `corepack pnpm`.
20. The web app proxies `/api` to the API, so auth cookies are first-party: `httpOnly`, `SameSite=Lax`, and a CSRF header on writes. The mobile app will use Bearer tokens.
21. The designs' rental-specific fields (client, contract, late return, "Contrats Karia") are not in the core. They return as an optional panel with the Karia integration (Milestone 5).

## Milestone 2
22. **No Docker on the development PC.** Replacements: PGlite with its official PostGIS extension (PostGIS 3.6); an in-memory event bus instead of Redis (same interface, so Redis can be added later without changing features); the simulator posts Traccar-format JSON straight to the ingest endpoint, so it uses the same adapter code as forwarded real-device data. Only the Traccar decoding step itself is skipped.
23. A vehicle is **moving** at 3 km/h or more, **stopped** below that, **offline** after 10 minutes without data.
24. Fixes are rejected when the device reports no GPS lock, when they are more than 5 minutes in the future, or when they are older than the retention period. Late (buffered) fixes are stored but never move the live marker backwards. Retries of the same fix are stored once.
25. Battery is used only when the device reports a **percentage**. Raw voltage is kept as an attribute, because converting volts to % depends on the device model.
26. The `positions` table is not partitioned yet. Monthly partitions are planned for production, so retention can drop whole months.
27. **Basemap:** self-hosted Protomaps tiles for Tunisia (full country to zoom 12, Tunis/Cap Bon/Hammamet to 14, Grand Tunis to 15). Without the downloaded files the map falls back to a plain background with a few reference places.
28. Simulator coordinates are hand-placed along main roads, not snapped to streets. All simulator data is flagged `source = simulator` and shown with a DÉMO label.
29. The browser opens the live WebSocket directly on the API (`NEXT_PUBLIC_API_WS_URL`), because the Next.js dev proxy does not reliably forward WebSockets.
30. Arabic map labels use MapLibre's official right-to-left text plugin, self-hosted in `apps/web/public/vendor/` (BSD-2-Clause licence file alongside).

## Milestone 3
31. **Trips are computed when a report is opened**, from stored positions (no trips table), so they always include late fixes. A trip ends after 5 minutes without movement or 15 minutes without data. Trips that never get 200 m from their start are GPS drift and are ignored. A cached trips table can come later if reports get slow.
32. **Place names** in the timeline come from the organization's own zones (smallest zone containing the point). Street addresses need a geocoder (for example a self-hosted Photon with Tunisia data): to decide.
33. **Alerts fire once per incident.** Speeding needs 15 s above the limit (configurable) and re-arms 5 km/h under it. Low battery re-arms 5 points above the threshold. Movement out of hours re-arms after 10 minutes still. Offline re-arms when the device reports again. Zone rules learn the current side on the first fix after a change, without alerting.
34. Speeding without an explicit limit uses the vehicle's own limit, else 110 km/h. Tunisian legal limits by road type are not modelled.
35. Allowed hours use Tunis time. A slot that crosses midnight belongs to the day it starts (Friday 22:00 to 06:00 covers Saturday 03:00).
36. Alerts are evaluated on the vehicle's newest position only; buffered old fixes never trigger alerts.
37. Severity has two levels, matching the designs: **Urgent** and **À vérifier**.
38. The alerts badge in the menu refreshes every 30 seconds; the inbox every 20 seconds. Real-time push comes with the mobile app (Milestone 4).
