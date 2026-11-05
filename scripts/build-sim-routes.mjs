#!/usr/bin/env node
/**
 * Makes the simulator's demo vehicles drive along real roads. For each scenario in
 * apps/simulator/src/scenarios.ts, every leg between two waypoints is routed on the road graph
 * from our own self-hosted tiles (OpenStreetMap data), respecting one-way streets. Scenarios
 * that drove their legs backwards get a separately routed return trip, so the way back is legal
 * too. The result is a generated file the simulator reads; without it, the simulator falls back
 * to the hand-placed waypoints.
 *
 * Output: apps/simulator/src/road-legs.generated.json
 * Usage:  node scripts/build-sim-routes.mjs   (after `corepack pnpm basemap`)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRoadGraph, simplify } from './lib/road-graph.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TILES = join(root, 'apps/web/public/map/tiles');
const { SCENARIOS } = await import(pathToFileURL(join(root, 'apps/simulator/src/scenarios.ts')).href);

/** Zoom-15 tiles exist for Grand Tunis only; elsewhere zoom 14 (still every street). */
const Z15 = [9.95, 36.65, 10.45, 37.0];
const inside = ([lat, lon], b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
const bboxOf = (pts, m) => [
  Math.min(...pts.map((p) => p[1])) - m,
  Math.min(...pts.map((p) => p[0])) - m,
  Math.max(...pts.map((p) => p[1])) + m,
  Math.max(...pts.map((p) => p[0])) + m,
];

const graphs = new Map();
function graphFor(points) {
  const zoom = points.every((p) => inside(p, Z15)) ? 15 : 14;
  const bbox = bboxOf(points, 0.015);
  const key = `${zoom}:${bbox.map((v) => v.toFixed(3)).join(',')}`;
  if (!graphs.has(key)) graphs.set(key, { zoom, g: buildRoadGraph({ tilesDir: TILES, zoom, bbox, log: () => {} }) });
  return graphs.get(key);
}

const round6 = (v) => Math.round(v * 1e6) / 1e6;

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const allowedCache = new Map();
function allowedFor(g, profile) {
  const key = `${profile}`;
  if (allowedCache.has(g) && allowedCache.get(g)[key]) return allowedCache.get(g)[key];
  const main = g.mainComponent(profile);
  const set = profile === 'car' ? main.map((v, i) => (v && g.adj[i].some((e) => MAJOR.has(e.cls)) ? 1 : 0)) : main;
  allowedCache.set(g, { ...(allowedCache.get(g) ?? {}), [key]: set });
  return set;
}

/**
 * Route from a node (or, for the first leg, from the closest of several candidate road points:
 * the nearest one can sit on a pedestrian street or a small island the vehicle cannot leave).
 */
function routeLeg(g, fromNode, fromLatLon, toLatLon, profile, label) {
  const target = [toLatLon[1], toLatLon[0]];
  // Start and end inside the main network, so every next leg (and the loop) stays drivable;
  // cars snap their (approximate) waypoints to main roads, as the scenarios intend.
  const main = allowedFor(g, profile);
  const candidates =
    fromNode !== null
      ? [fromNode]
      : g.nodes
          .map((n, id) => [main[id] ? g.metres([fromLatLon[1], fromLatLon[0]], g.toLonLat(...n)) : Infinity, id])
          .filter(([d]) => d < 1500)
          .sort((a, b) => a[0] - b[0])
          .slice(0, 40)
          .map(([, id]) => id);
  for (const c of candidates) {
    try {
      return g.route(c, target, profile, 1500, main);
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(`No road route for "${label}" from ${fromLatLon} to ${toLatLon} (${candidates.length} start points tried)`);
}
const out = {};
for (const sc of SCENARIOS) {
  const way = [sc.start, ...sc.legs.map((l) => l.to)];
  const moving = sc.legs.some((l) => l.kmh > 0);
  if (!moving) continue; // parked vehicles stay where they are
  // Legs to drive: as written, plus (for "reverse") the trip back, routed on its own.
  const plan = sc.legs.map((l, i) => ({ from: way[i], to: l.to, kmh: l.kmh, stopS: l.stopS }));
  if (sc.loop === 'reverse')
    for (let i = sc.legs.length - 1; i >= 0; i--) plan.push({ from: way[i + 1], to: way[i], kmh: sc.legs[i].kmh, stopS: i > 0 ? sc.legs[i - 1].stopS : undefined });

  const profile = /trottinette|scooter/i.test(sc.label) ? 'trot' : 'car';
  const { zoom, g } = graphFor(way);
  const legs = [];
  let start = null;
  let cur = null;
  for (const p of plan) {
    const edges = routeLeg(g, cur, p.from, p.to, profile, sc.label);
    if (!edges.length) continue; // already there
    const ids = [edges[0].from, ...edges.map((e) => e.to)];
    cur = ids[ids.length - 1];
    const px = simplify(ids.map((id) => g.nodes[id]), zoom >= 15 ? 4 : 2);
    const ll = px.map(([x, y]) => g.toLonLat(x, y));
    if (process.env.DEBUG_LEGS) {
      const road = edges.reduce((sum, e) => sum + e.len, 0);
      const straight = g.metres([p.from[1], p.from[0]], [p.to[1], p.to[0]]);
      console.log(`   ${(road / 1000).toFixed(1)} km road vs ${(straight / 1000).toFixed(1)} km straight  ${p.from} -> ${p.to}`);
    }
    if (!start) start = [round6(ll[0][1]), round6(ll[0][0])];
    ll.slice(1).forEach(([lon, lat], k, arr) => {
      const leg = { to: [round6(lat), round6(lon)], kmh: p.kmh };
      if (k === arr.length - 1 && p.stopS) leg.stopS = p.stopS;
      legs.push(leg);
    });
  }
  out[sc.imei] = { start, loop: 'restart', legs };
  const km = legs.reduce((s, l, i) => s + g.metres([ (i ? legs[i - 1].to : start)[1], (i ? legs[i - 1].to : start)[0] ], [l.to[1], l.to[0]]), 0) / 1000;
  console.log(`${sc.label}: ${legs.length} road points, ${km.toFixed(1)} km per loop (zoom ${zoom}, ${profile})`);
}

writeFileSync(
  join(root, 'apps/simulator/src/road-legs.generated.json'),
  `${JSON.stringify({ note: 'Generated by scripts/build-sim-routes.mjs from self-hosted OpenStreetMap data (ODbL). Simulated vehicles.', scenarios: out })}\n`,
);
