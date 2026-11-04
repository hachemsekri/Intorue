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
8. **IMEI = 15 digits with a valid Luhn check digit.** If the real device uses another identifier, the validation will be relaxed when the device docs arrive.
9. An IMEI can be active in only one organization. Archiving the device frees it.
10. One device per vehicle, and one vehicle per device. The link history is kept in `device_assignments`, so trips stay attributed to the right vehicle.
11. A device is **offline** after 10 minutes without data, and **never connected** before its first report.
12. Location history is kept **90 days by default**, configurable per organization between 7 and 365 days, pending legal advice. Enforcement (the deletion job) arrives with location data in Milestone 2.
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
17. **PGlite** (embedded PostgreSQL) makes Milestone 1 runnable and testable without Docker. Production must use PostgreSQL 16 with PostGIS; the API refuses PGlite in production.
18. Rate limits are kept in memory for now. **Milestone 2 moves them to Redis** so they hold across several API instances.
19. **Turborepo was dropped** in favour of `pnpm -r`, because pnpm cannot be installed globally on this PC without admin rights. Every command goes through `corepack pnpm`.
20. The web app proxies `/api` to the API, so auth cookies are first-party: `httpOnly`, `SameSite=Lax`, and a CSRF header on writes. The mobile app will use Bearer tokens.
21. The designs' rental-specific fields (client, contract, late return, "Contrats Karia") are not in the core. They return as an optional panel with the Karia integration (Milestone 5).
