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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TILES = join(root, 'apps/web/public/map/tiles');
const Z = 15;
const BBOX = [10.15, 36.78, 10.37, 36.895]; // west, south, east, north: Tunis centre to La Marsa
const SNAP = 12; // tile units (~3 m at zoom 15): joins road ends the tiles split apart

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

// ---------- tiles → road graph ----------

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const EXTENT = 4096;
const WORLD = 2 ** Z * EXTENT;
const toLonLat = (wx, wy) => [(wx / WORLD) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / WORLD))) * 180) / Math.PI];
const metres = (a, b) => {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371000;
};

const ROAD_KINDS = new Set(['highway', 'major_road', 'minor_road', 'path']);
const nodes = []; // [wx, wy]
const cells = new Map(); // snapping grid
const adj = []; // node -> [{to, len, name, ar, cls, profiles}]

function nodeAt(wx, wy) {
  const cx = Math.floor(wx / SNAP);
  const cy = Math.floor(wy / SNAP);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const id of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
        const n = nodes[id];
        if (Math.abs(n[0] - wx) <= SNAP && Math.abs(n[1] - wy) <= SNAP) return id;
      }
  const id = nodes.push([wx, wy]) - 1;
  adj.push([]);
  const key = `${cx},${cy}`;
  (cells.get(key) ?? cells.set(key, []).get(key)).push(id);
  return id;
}

function roadClass(p) {
  if (p.kind === 'highway') return p.kind_detail === 'motorway' ? 'motorway' : 'trunk';
  if (p.kind === 'major_road') return p.kind_detail || 'secondary';
  if (p.kind === 'path') return 'path';
  return p.kind_detail === 'service' ? 'service' : 'minor';
}

/**
 * Tiles repeat a margin of their neighbours' roads. Keeping only each tile's own square, cut
 * exactly at its edge, makes a road crossing two tiles meet at one shared boundary point.
 */
function clipToTile(line) {
  const out = [];
  let cur = [];
  const inside = (p) => p.x >= 0 && p.x <= EXTENT && p.y >= 0 && p.y <= EXTENT;
  // Liang–Barsky clip of segment a→b to the tile square; returns [t0, t1] or null.
  const clip = (a, b) => {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x], [dx, EXTENT - a.x], [-dy, a.y], [dy, EXTENT - a.y]]) {
      if (p === 0) {
        if (q < 0) return null;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    return t0 <= t1 ? [t0, t1] : null;
  };
  const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const c = clip(a, b);
    if (!c) {
      if (cur.length > 1) out.push(cur);
      cur = [];
      continue;
    }
    const pa = c[0] > 0 ? at(a, b, c[0]) : a;
    const pb = c[1] < 1 ? at(a, b, c[1]) : b;
    if (!cur.length) cur.push(pa);
    cur.push(pb);
    if (c[1] < 1 || !inside(b)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

let tiles = 0;
for (let x = lon2x(BBOX[0], Z); x <= lon2x(BBOX[2], Z); x++) {
  for (let y = lat2y(BBOX[3], Z); y <= lat2y(BBOX[1], Z); y++) {
    const file = join(TILES, String(Z), String(x), `${y}.mvt`);
    if (!existsSync(file)) continue;
    tiles++;
    const layer = new VectorTile(new Pbf(readFileSync(file))).layers.roads;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      if (!ROAD_KINDS.has(p.kind) || p.access === 'no' || p.access === 'private') continue;
      const cls = roadClass(p);
      const props = { name: p['name:fr'] || p.name || '', ar: p['name:ar'] || (p.script === 'Arabic' ? p.name : '') || '', cls };
      const oneway = p.oneway === 'yes';
      for (const raw of f.loadGeometry()) for (const line of clipToTile(raw)) {
        let prev = null;
        for (const pt of line) {
          const id = nodeAt(x * EXTENT + pt.x, y * EXTENT + pt.y);
          if (prev !== null && prev !== id) {
            const len = metres(toLonLat(...nodes[prev]), toLonLat(...nodes[id]));
            adj[prev].push({ to: id, len, ...props });
            // Pedestrian paths are two-way; one-way streets only for motor vehicles.
            adj[id].push({ to: prev, len, ...props, against: oneway });
          }
          prev = id;
        }
      }
    }
  }
}
if (!tiles) {
  console.error('No zoom-15 tiles found. Run `corepack pnpm basemap` first.');
  process.exit(1);
}

/**
 * Dead ends that stop a few metres short of another road (tile clipping, simplified roundabouts)
 * are joined to the nearest road point within 12 m. Only dead ends: two parallel carriageways
 * are never merged.
 */
const JOIN = 48; // tile units, ~12 m
{
  const grid = new Map();
  nodes.forEach((n, i) => {
    const k = `${Math.floor(n[0] / JOIN)},${Math.floor(n[1] / JOIN)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  });
  let joined = 0;
  nodes.forEach((n, i) => {
    const near = new Set(adj[i].map((e) => e.to));
    if (near.size !== 1) return; // not a dead end
    const cx = Math.floor(n[0] / JOIN);
    const cy = Math.floor(n[1] / JOIN);
    let best = -1;
    let bd = JOIN;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j === i || near.has(j)) continue;
          const d = Math.hypot(nodes[j][0] - n[0], nodes[j][1] - n[1]);
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
    if (best < 0) return;
    const { name, ar, cls } = adj[i][0];
    const len = metres(toLonLat(...n), toLonLat(...nodes[best]));
    adj[i].push({ to: best, len, name, ar, cls });
    adj[best].push({ to: i, len, name, ar, cls });
    joined++;
  });
  console.log(`Joined ${joined} dead ends to nearby roads.`);
}

// ---------- routing ----------

const COST = {
  car: { motorway: 0.55, trunk: 0.6, primary: 0.72, secondary: 0.82, tertiary: 0.9, minor: 1.15, service: 2.5 },
  trot: { primary: 1.1, secondary: 1, tertiary: 0.95, minor: 0.9, service: 1.4, path: 1.05 },
};
const cost = (e, profile) => {
  const f = COST[profile][e.cls];
  if (f === undefined) return Infinity;
  if (e.against) return Infinity; // never against a one-way street
  return e.len * f;
};

function nearest([lon, lat], profile) {
  let best = -1;
  let bd = Infinity;
  nodes.forEach((n, id) => {
    if (!adj[id].some((e) => cost(e, profile) < Infinity)) return;
    const d = metres([lon, lat], toLonLat(...n));
    if (d < bd) {
      bd = d;
      best = id;
    }
  });
  return best;
}

function route(a, target, profile) {
  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length);
  const heap = [[0, a]];
  dist[a] = 0;
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const e of adj[u]) {
      const nd = d + cost(e, profile);
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = { from: u, e };
        push([nd, e.to]);
      }
    }
  }
  // The destination is the reachable road point nearest to the target (legally, one-ways included).
  let b = -1;
  let bd = 150;
  dist.forEach((d, i) => {
    if (d === Infinity || i === a) return;
    const m = metres(target, toLonLat(...nodes[i]));
    if (m < bd) {
      bd = m;
      b = i;
    }
  });
  if (b < 0) throw new Error('No route found');
  const edges = [];
  for (let v = b; v !== a; v = prev[v].from) edges.push({ ...prev[v].e, from: prev[v].from });
  return edges.reverse();
}

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

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let bd = tol;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

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
console.log(`Read ${tiles} tiles, ${nodes.length} road nodes.`);
