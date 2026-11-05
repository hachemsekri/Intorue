# Map and data services

Every external map or data service, with its licence, required attribution and cost.
Rule: no public demo services (demo OSRM, public Nominatim or Photon) and no unlicensed imagery as production dependencies.
The provider is chosen in `packages/config/src/index.ts` (`mapProvider`) and by environment variable, so it can change without rewriting the app.

| Service | Used for | Licence | Attribution shown | Cost | Status |
|---|---|---|---|---|---|
| OpenStreetMap data | Base map content | ODbL 1.0 | "© OpenStreetMap contributors" (link to /copyright) | Free | **In use**: shown on every map |
| Protomaps basemap, Tunisia PMTiles extract, **self-hosted** | Vector tiles (dev, candidate for prod) | Data ODbL; Protomaps styles BSD-3 | "Protomaps © OpenStreetMap" | Free; hosting is ours | **Installed** (build 20261103), served from our own app |
| MapLibre GL JS / MapLibre Native | Map rendering, web and mobile | BSD-3 | Not required | Free | **In use on web (M2)**; mobile M4 |
| GeoNames (Tunisia dump) | Offline reverse geocoding ("Hammamet", "Lafayette, Tunis") | CC BY 4.0 | "GeoNames" credit on the about/legal page | Free | M3 (place names in trip timelines); needs a download |
| Traccar | Receiving and decoding device data | Apache 2.0 | Not required | Free (self-hosted) | Adapter and ingest built (M2); the Traccar server itself needs Docker or a server |
| Expo Push Service (via FCM and APNs) | Mobile push notifications | Expo, Google and Apple terms | Not required | Free tier; Apple developer account $99/year | Built (M4); **off until you approve** an Expo project (`PUSH_PROVIDER=expo`) |
| Satellite imagery | "Satellite" toggle in the designs | Must be licensed (e.g. MapTiler, Esri, Mapbox) | Provider-specific | Paid | **Not in v1**: toggle hidden |
| Routing / map matching | Not needed: routes are drawn from real GPS points | n/a | n/a | n/a | Not used |
| PostGIS (in PGlite: `@electric-sql/pglite-postgis`) | Geography types, distances, areas | GPL-2.0 (PostGIS), Apache-2.0 (PGlite) | Not required | Free | In use (M2) |
| Noto Sans fonts (map labels), via Protomaps basemaps-assets | Label glyphs, Latin and Arabic | SIL Open Font License 1.1 | Not required | Free | Installed, self-hosted |
| mapbox-gl-rtl-text (MapLibre RTL plugin) | Correct shaping and direction of Arabic labels | BSD-2-Clause | Not required | Free | Installed, self-hosted (`public/vendor`) |
| Protomaps "light" icon sprites (basemaps-assets) | Map icons (POIs, shields) | **Licence to confirm** in the basemaps-assets repository before launch | n/a | Free | Installed, self-hosted |

## Self-hosted basemap

`node scripts/fetch-basemap.mjs` reads only the Tunisia tiles from a Protomaps daily build (HTTP range requests on
`build.protomaps.com`, a one-off download, not a runtime dependency) and writes them, with fonts and icons, to
`apps/web/public/map/` (git-ignored, so each developer or server runs the script once).

| Area | Zoom levels | Detail |
|---|---|---|
| All of Tunisia | 0–12 | Cities, main roads |
| Tunis, Cap Bon, Hammamet | up to 14 | Streets |
| Grand Tunis | up to 15 | Detailed streets |

Outside these areas the map stays blank at higher zoom. To extend coverage (Sousse, Sfax…), add an area in the script and run it again: tiles already downloaded are kept.

At runtime the app calls **no external map service**: tiles, fonts and icons are served from our own origin.
Labels follow the app language using OSM names (`name:fr`, `name:ar`, `name:en`, falling back to the local name).

Production: serve the same files from our own server or object storage behind a CDN. Refresh them from a newer build every few months; OSM data changes.
