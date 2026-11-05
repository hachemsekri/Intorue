/**
 * Road graph and router built from our own self-hosted Protomaps tiles (OpenStreetMap data, ODbL).
 * No routing service is called. Used by scripts that need routes that follow real roads:
 * the home page's example trips and the simulator's demo vehicles.
 *
 *   const g = buildRoadGraph({ tilesDir, zoom: 15, bbox: [west, south, east, north] });
 *   const edges = g.route(g.nearest([lon, lat], 'car'), [lon, lat], 'car');
 *
 * Profiles: "car" (also motorcycles) never drives against a one-way street; "trot" (scooters)
 * keeps off motorways and may use paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

export function buildRoadGraph({ tilesDir, zoom: Z = 15, bbox: BBOX, log = console.log }) {
  // ---------- tiles → road graph ----------

  const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const EXTENT = 4096;
  const WORLD = 2 ** Z * EXTENT;
  const SNAP = Z >= 15 ? 12 : 6; // ~3 m: joins road ends the tiles split apart
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
      const file = join(tilesDir, String(Z), String(x), `${y}.mvt`);
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
  if (!tiles) throw new Error(`No zoom-${Z} tiles found for this area. Run \`corepack pnpm basemap\` first.`);

  /**
   * Dead ends that stop a few metres short of another road (tile clipping, simplified roundabouts)
   * are joined to the nearest road point within 12 m. Only dead ends: two parallel carriageways
   * are never merged.
   */
  const JOIN = Z >= 15 ? 48 : 24; // ~12 m
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
    log(`Joined ${joined} dead ends to nearby roads.`);
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

  function route(a, target, profile, maxSnapM = 150, allowed = null) {
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
    let bd = maxSnapM;
    // With an allowed set (simulator), weigh the drive to reach a point against its distance to
    // the target, so the end lands on the carriageway going the right way rather than the
    // closest one behind a long detour. Without it (home page), the nearest point wins.
    let bestScore = Infinity;
    dist.forEach((d, i) => {
      if (d === Infinity || i === a || (allowed && !allowed[i])) return;
      const m = metres(target, toLonLat(...nodes[i]));
      if (m >= maxSnapM) return;
      const score = allowed ? d + 4 * m : m;
      if (score < bestScore) {
        bestScore = score;
        bd = m;
        b = i;
      }
    });
    if (b < 0) throw new Error('No route found');
    const edges = [];
    for (let v = b; v !== a; v = prev[v].from) edges.push({ ...prev[v].e, from: prev[v].from });
    return edges.reverse();
  }


  /**
   * Nodes of the largest strongly connected part of the network for a profile: from any of them
   * a vehicle can legally reach any other (no one-way traps). Kosaraju, iterative.
   */
  const mainCache = {};
  function mainComponent(profile) {
    if (mainCache[profile]) return mainCache[profile];
    const n = nodes.length;
    const ok = (e) => cost(e, profile) < Infinity;
    const radj = Array.from({ length: n }, () => []);
    for (let u = 0; u < n; u++) for (const e of adj[u]) if (ok(e)) radj[e.to].push(u);
    const seen = new Uint8Array(n);
    const order = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0]) continue;
      const stack = [[s0, 0]];
      seen[s0] = 1;
      while (stack.length) {
        const top = stack[stack.length - 1];
        const edges = adj[top[0]];
        let pushed = false;
        while (top[1] < edges.length) {
          const e = edges[top[1]++];
          if (ok(e) && !seen[e.to]) {
            seen[e.to] = 1;
            stack.push([e.to, 0]);
            pushed = true;
            break;
          }
        }
        if (!pushed) {
          order.push(top[0]);
          stack.pop();
        }
      }
    }
    const comp = new Int32Array(n).fill(-1);
    const sizes = [];
    for (let k = order.length - 1; k >= 0; k--) {
      const s0 = order[k];
      if (comp[s0] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [s0];
      comp[s0] = id;
      while (stack.length) {
        const u = stack.pop();
        size++;
        for (const v of radj[u])
          if (comp[v] < 0) {
            comp[v] = id;
            stack.push(v);
          }
      }
      sizes.push(size);
    }
    const best = sizes.indexOf(Math.max(...sizes));
    const inMain = new Uint8Array(n);
    for (let i = 0; i < n; i++) inMain[i] = comp[i] === best ? 1 : 0;
    return (mainCache[profile] = inMain);
  }

  return { nodes, adj, toLonLat, metres, nearest, route, mainComponent, tiles };
}

/** Douglas–Peucker on [x, y] points (any planar unit). */
export function simplify(pts, tol) {
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
