#!/usr/bin/env node
/**
 * Builds the home page's example trips along real roads, from our own self-hosted Protomaps
 * tiles (OpenStreetMap data, ODbL). No routing service is called: the road graph is read from
 * apps/web/public/map/tiles/15 (run `corepack pnpm basemap` first), one-way streets are respected,
 * and street names come from the map data in French and Arabic.
 *
 * The trips themselves are SIMULATED examples (no real GPS history is used or claimed).
 *
 * Output:
 *   apps/web/public/home/routes.json          route lines, fetched by the page only when a map needs them
 *   apps/web/components/home/routes-meta.json  streets, distances, times and events (side panel text)
 *
 * Usage: node scripts/build-home-routes.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoadGraph, simplify } from './lib/road-graph.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TILES = join(root, 'apps/web/public/map/tiles');
const Z = 15;
const BBOX = [10.15, 36.78, 10.37, 36.895]; // west, south, east, north: Tunis centre to La Marsa

/** Places used in event labels (real neighbourhoods). */
const PLACES = {
  lac: { fr: 'Les Berges du Lac', ar: 'ضفاف البحيرة' },
  goulette: { fr: 'La Goulette', ar: 'حلق الوادي' },
  marsa: { fr: 'La Marsa', ar: 'المرسى' },
  sidibou: { fr: 'Sidi Bou Saïd', ar: 'سيدي بوسعيد' },
  carthage: { fr: 'Carthage', ar: 'قرطاج' },
};

/** The three example trips: endpoints, profile and the story told along them. */
const TRIPS = {
  car: { from: [10.235, 36.8385], to: [10.1815, 36.7995], profile: 'car', start: '08:12', story: 'car' },
  moto: { from: [10.305, 36.818], to: [10.324, 36.8785], profile: 'car', start: '02:04', story: 'moto' },
  trot: { from: [10.3417, 36.8686], to: [10.3235, 36.853], profile: 'trot', start: '16:40', story: 'trot' },
};

// ---------- road graph (shared with the simulator's route builder) ----------

const graph = buildRoadGraph({ tilesDir: TILES, zoom: Z, bbox: BBOX });
const { nodes, toLonLat, nearest, route } = graph;

// ---------- legs: consecutive stretches of one street ----------

function toLegs(edges) {
  let legs = [];
  for (const e of edges) {
    const last = legs[legs.length - 1];
    if (last && (last.name === e.name || !e.name)) last.m += e.len;
    else if (last && !last.name) Object.assign(last, { name: e.name, ar: e.ar, cls: e.cls, m: last.m + e.len });
    else legs.push({ name: e.name, ar: e.ar, cls: e.cls, m: e.len });
  }
  // Fold very short stretches (under 120 m) into the previous street, then keep at most 7.
  const fold = (i) => {
    const j = i > 0 ? i - 1 : i + 1;
    const keep = legs[j].m >= legs[i].m ? legs[j] : legs[i];
    const merged = { ...keep, m: legs[i].m + legs[j].m };
    legs.splice(Math.min(i, j), 2, merged);
  };
  for (let i = legs.length - 2; i >= 0; i--) if (legs.length > 2 && legs[i].m < 120) fold(i);
  while (legs.length > 7) {
    let s = 0;
    legs.forEach((l, i) => i < legs.length - 1 && l.m < legs[s].m && (s = i));
    fold(s);
  }
  legs = legs.filter((l) => l.m > 0);
  // Folding can leave the same street twice in a row: join those.
  legs = legs.reduce((acc, l) => {
    const last = acc[acc.length - 1];
    if (last && last.name === l.name) last.m += l.m;
    else acc.push({ ...l });
    return acc;
  }, []);
  for (const l of legs) if (!l.name) Object.assign(l, { name: 'Rue sans nom', ar: 'نهج بلا اسم' });
  return legs;
}

const SPEED = { motorway: 90, trunk: 72, primary: 50, secondary: 45, tertiary: 38, minor: 28, service: 18, path: 16 };

/** The simulated story: speeds, times, events and alerts for each leg. */
function tell(story, legs, start) {
  const out = legs.map((l) => ({
    fr: l.name,
    ar: l.ar || l.name,
    m: Math.round(l.m),
    v: story === 'trot' ? Math.min(22, SPEED[l.cls] ?? 18) : story === 'moto' ? Math.round((SPEED[l.cls] ?? 30) * 1.1) : SPEED[l.cls] ?? 30,
    event: { kind: 'street' },
  }));
  const n = out.length;
  if (story === 'car') {
    out[0].event = { kind: 'departFrom', place: 'lac' };
    const fast = out.slice(0, 3).reduce((b, l, i) => (l.v > out[b].v ? i : b), 0);
    out[fast].v = 88;
    out[fast].alert = 'speeding';
    if (fast > 0) out[fast].event = { kind: 'speeding' };
    out[n - 1].event = { kind: 'stopAt', street: true };
    out[n - 1].v = Math.min(out[n - 1].v, 18);
  } else if (story === 'moto') {
    out[0].event = { kind: 'night', place: 'goulette' };
    out[0].alert = 'movement_schedule';
    const exit = Math.max(1, n - 2);
    out[exit].event = { kind: 'zoneExit' };
    out[exit].alert = 'geofence_exit';
    out[n - 1].event = { kind: 'stopAt', place: 'marsa' };
  } else {
    out[0].event = { kind: 'departFrom', place: 'sidibou' };
    out[n - 1].event = { kind: 'batteryLow', place: 'carthage' };
    out[n - 1].alert = 'low_battery';
    out[n - 1].v = 12;
  }
  let [h, mi] = start.split(':').map(Number);
  let mins = h * 60 + mi;
  for (const l of out) {
    l.t = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.round(mins) % 60).padStart(2, '0')}`;
    mins += Math.max(1, l.m / ((l.v * 0.7 * 1000) / 60));
  }
  return out;
}

// ---------- geometry output ----------


const geometry = {};
const meta = { places: PLACES, routes: {} };
for (const [key, trip] of Object.entries(TRIPS)) {
  const a = nearest(trip.from, trip.profile);
  const edges = route(a, trip.to, trip.profile);
  // Work in world pixels for simplification (~0.25 m each), then convert.
  const px = [nodes[edges[0].from], ...edges.map((e) => nodes[e.to])];
  const line = simplify(px, 4).map(([wx, wy]) => toLonLat(wx, wy).map((v) => Math.round(v * 1e6) / 1e6));
  const legs = tell(trip.story, toLegs(edges), trip.start);
  const total = edges.reduce((s, e) => s + e.len, 0);
  geometry[key] = line;
  meta.routes[key] = { metres: Math.round(total), legs };
  console.log(`${key}: ${(total / 1000).toFixed(2)} km, ${line.length} points, ${legs.length} streets: ${legs.map((l) => l.fr).join(' → ')}`);
}

const generated = 'Generated by scripts/build-home-routes.mjs from self-hosted OpenStreetMap data (ODbL). Simulated trips.';
writeFileSync(join(root, 'apps/web/public/home/routes.json'), JSON.stringify({ note: generated, routes: geometry }));
writeFileSync(join(root, 'apps/web/components/home/routes-meta.json'), `${JSON.stringify({ note: generated, ...meta }, null, 1)}\n`);
console.log(`Read ${graph.tiles} tiles, ${nodes.length} road nodes.`);
