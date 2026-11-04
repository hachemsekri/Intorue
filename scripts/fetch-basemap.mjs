#!/usr/bin/env node
/**
 * Downloads a Tunisia basemap for self-hosting: vector tiles taken from a Protomaps daily
 * build (OpenStreetMap data, ODbL), plus the fonts and icons the style needs.
 *
 * Only the tiles we need are read from the build (HTTP range requests), never the whole
 * planet file. Output goes to apps/web/public/map/ (git-ignored):
 *   tiles/{z}/{x}/{y}.mvt   fonts/{fontstack}/{range}.pbf   sprites/light{,@2x}.{json,png}   basemap.json
 *
 * Coverage (see docs/MAP_SERVICES.md):
 *   - all of Tunisia up to zoom 12 (city level)
 *   - Tunis, Cap Bon, Hammamet up to zoom 14 (streets)
 *   - Grand Tunis up to zoom 15 (detailed streets)
 *
 * Usage: node scripts/fetch-basemap.mjs [--build 20261103] [--concurrency 16]
 */
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PMTiles } from 'pmtiles';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/public/map');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BUILD = arg('build', '20261103');
const CONCURRENCY = Number(arg('concurrency', 16));
const SOURCE = `https://build.protomaps.com/${BUILD}.pmtiles`;
const ASSETS = 'https://protomaps.github.io/basemaps-assets';

// [west, south, east, north], zoom range
const AREAS = [
  { name: 'Tunisie', bbox: [7.4, 30.1, 11.7, 37.6], minZoom: 0, maxZoom: 12 },
  { name: 'Tunis, Cap Bon, Hammamet', bbox: [9.8, 36.3, 11.1, 37.35], minZoom: 13, maxZoom: 14 },
  { name: 'Grand Tunis', bbox: [9.95, 36.65, 10.45, 37.0], minZoom: 15, maxZoom: 15 },
];

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function* tileList() {
  for (const a of AREAS) {
    const [w, s, e, n] = a.bbox;
    for (let z = a.minZoom; z <= a.maxZoom; z++) {
      for (let x = lon2x(w, z); x <= lon2x(e, z); x++) {
        for (let y = lat2y(n, z); y <= lat2y(s, z); y++) yield [z, x, y];
      }
    }
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function download(url, file) {
  if (existsSync(file) && statSync(file).size > 0) return 'cached';
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 404) return 'missing';
    if (res.ok) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    }
    if (attempt >= 4) throw new Error(`${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function tiles() {
  const p = new PMTiles(SOURCE);
  const h = await p.getHeader();
  console.log(`Source ${SOURCE} (zoom ${h.minZoom}-${h.maxZoom})`);
  const list = [...tileList()];
  console.log(`${list.length} tiles to fetch`);
  let done = 0;
  let bytes = 0;
  let empty = 0;
  const started = Date.now();
  await pool(list, CONCURRENCY, async ([z, x, y]) => {
    const file = join(out, 'tiles', String(z), String(x), `${y}.mvt`);
    if (!existsSync(file)) {
      for (let attempt = 1; ; attempt++) {
        try {
          const t = await p.getZxy(z, x, y);
          if (t?.data?.byteLength) {
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, Buffer.from(t.data));
            bytes += t.data.byteLength;
          } else empty++;
          break;
        } catch (e) {
          if (attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }
    if (++done % 500 === 0 || done === list.length) {
      const s = (Date.now() - started) / 1000;
      console.log(`  ${done}/${list.length} tiles · ${(bytes / 1e6).toFixed(1)} MB · ${s.toFixed(0)} s`);
    }
  });
  return { count: list.length, empty, bytes };
}

async function fonts() {
  // Ranges covering Latin (incl. accents), punctuation, Arabic and Arabic presentation forms.
  const ranges = ['0-255', '256-511', '512-767', '768-1023', '1536-1791', '1792-2047', '8192-8447', '64256-64511', '64512-64767', '64768-65023', '65024-65279', '65280-65535'];
  const stacks = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
  const jobs = stacks.flatMap((s) => ranges.map((r) => [s, r]));
  await pool(jobs, 8, async ([s, r]) => {
    await download(`${ASSETS}/fonts/${encodeURIComponent(s)}/${r}.pbf`, join(out, 'fonts', s, `${r}.pbf`));
  });
  console.log(`Fonts: ${stacks.length} stacks × ${ranges.length} ranges`);
}

async function sprites() {
  for (const f of ['light.json', 'light.png', 'light@2x.json', 'light@2x.png']) {
    await download(`${ASSETS}/sprites/v4/${f}`, join(out, 'sprites', f));
  }
  console.log('Sprites: light');
}

const t = await tiles();
await fonts();
await sprites();
writeFileSync(
  join(out, 'basemap.json'),
  JSON.stringify(
    {
      source: SOURCE,
      build: BUILD,
      downloadedAt: new Date().toISOString(),
      areas: AREAS,
      maxZoom: Math.max(...AREAS.map((a) => a.maxZoom)),
      tiles: t.count - t.empty,
      megabytes: Math.round(t.bytes / 1e6),
      attribution: '© OpenStreetMap contributors (ODbL) · Protomaps',
    },
    null,
    2,
  ),
);
console.log(`Done: ${t.count - t.empty} tiles, ${(t.bytes / 1e6).toFixed(0)} MB → apps/web/public/map`);
