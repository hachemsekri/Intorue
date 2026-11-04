# Map and data services

Every external map or data service, with its licence, required attribution and cost.
Rule: no public demo services (demo OSRM, public Nominatim or Photon) and no unlicensed imagery as production dependencies.
The provider is chosen in `packages/config/src/index.ts` (`mapProvider`) and by environment variable, so it can change without rewriting the app.

| Service | Used for | Licence | Attribution shown | Cost | Status |
|---|---|---|---|---|---|
| OpenStreetMap data | Base map content | ODbL 1.0 | "© OpenStreetMap contributors" (link to /copyright) | Free | With the basemap (needs download OK) |
| Protomaps basemap, Tunisia PMTiles extract, **self-hosted** | Vector tiles (dev, candidate for prod) | Data ODbL; Protomaps styles BSD-3 | "Protomaps © OpenStreetMap" | Free; hosting is ours | **M2, needs your OK to download (~100–200 MB)** |
| MapLibre GL JS / MapLibre Native | Map rendering, web and mobile | BSD-3 | Not required | Free | **In use on web (M2)**; mobile M4 |
| GeoNames (Tunisia dump) | Offline reverse geocoding ("Hammamet", "Lafayette, Tunis") | CC BY 4.0 | "GeoNames" credit on the about/legal page | Free | M3 (place names in trip timelines); needs a download |
| Traccar | Receiving and decoding device data | Apache 2.0 | Not required | Free (self-hosted) | Adapter and ingest built (M2); the Traccar server itself needs Docker or a server |
| Expo Push Service (via FCM and APNs) | Mobile push notifications | Expo, Google and Apple terms | Not required | Free tier; Apple developer account $99/year | M4, **will ask before using** |
| Satellite imagery | "Satellite" toggle in the designs | Must be licensed (e.g. MapTiler, Esri, Mapbox) | Provider-specific | Paid | **Not in v1**: toggle hidden |
| Routing / map matching | Not needed: routes are drawn from real GPS points | n/a | n/a | n/a | Not used |
| PostGIS (in PGlite: `@electric-sql/pglite-postgis`) | Geography types, distances, areas | GPL-2.0 (PostGIS), Apache-2.0 (PGlite) | Not required | Free | In use (M2) |

As of Milestone 2, the app calls **no external map or data service**. The map shows positions on a plain background until a basemap is installed.
To show streets: download a Tunisia PMTiles extract (Protomaps, ODbL), serve it ourselves, and set `NEXT_PUBLIC_MAP_STYLE`. **Waiting for your OK to download.**
