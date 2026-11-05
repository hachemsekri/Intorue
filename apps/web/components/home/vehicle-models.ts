/**
 * Small 3D vehicles built from map extrusions (no 3D library): each part is a footprint with a
 * base and top height, in metres of the real vehicle (x = right, y = forward). The models are
 * scaled up to a fixed on-screen size and drawn after the street names, so they stay on top.
 */
import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { LngLat, TripKey } from './routes';

type Ring = [number, number][];
type Part = [Ring, number, number, string];

const box = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const oval = (cx: number, cy: number, r: number, ry = r): Ring =>
  Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry] as [number, number];
  });

const W = '#F4F7FB';
const W2 = '#CBD6E3';
const G = '#0D2238';
const T = '#111821';
const N = '#16335C';
const A = '#3FE0D0';
const L = '#FFE9B0';
const R = '#F0314A';

/** len: real length (m); px: drawn length on screen (pixels). */
const MODELS: Record<TripKey, { len: number; px: number; parts: Part[] }> = {
  car: {
    len: 4.6,
    px: 56,
    parts: [
      [box(-1, 1.05, -0.72, 1.72), 0, 0.58, T],
      [box(0.72, 1.05, 1, 1.72), 0, 0.58, T],
      [box(-1, -1.72, -0.72, -1.05), 0, 0.58, T],
      [box(0.72, -1.72, 1, -1.05), 0, 0.58, T],
      [[[-0.62, 2.3], [0.62, 2.3], [0.9, 2.0], [0.95, 0.8], [0.95, -1.6], [0.8, -2.2], [0.5, -2.3], [-0.5, -2.3], [-0.8, -2.2], [-0.95, -1.6], [-0.95, 0.8], [-0.9, 2.0]], 0.22, 0.78, W],
      [box(-0.82, 2.0, -0.42, 2.27), 0.52, 0.72, L],
      [box(0.42, 2.0, 0.82, 2.27), 0.52, 0.72, L],
      [box(-0.75, -2.29, -0.3, -2.15), 0.52, 0.74, R],
      [box(0.3, -2.29, 0.75, -2.15), 0.52, 0.74, R],
      [[[-0.55, 1.95], [0.55, 1.95], [0.82, 1.1], [0.82, -1.7], [0.6, -2.1], [-0.6, -2.1], [-0.82, -1.7], [-0.82, 1.1]], 0.78, 0.88, W2],
      [[[-0.6, 0.95], [0.6, 0.95], [0.72, 0.5], [0.72, -1.1], [0.55, -1.45], [-0.55, -1.45], [-0.72, -1.1], [-0.72, 0.5]], 0.88, 1.27, G],
      [[[-0.5, 0.45], [0.5, 0.45], [0.6, 0.2], [0.6, -0.8], [0.5, -1.05], [-0.5, -1.05], [-0.6, -0.8], [-0.6, 0.2]], 1.27, 1.39, W],
    ],
  },
  moto: {
    len: 2.15,
    px: 42,
    parts: [
      [box(-0.07, 0.55, 0.07, 1.07), 0, 0.62, T],
      [box(-0.09, -1.07, 0.09, -0.5), 0, 0.62, T],
      [[[-0.14, 0.95], [0.14, 0.95], [0.2, 0.2], [0.17, -0.7], [0, -0.95], [-0.17, -0.7], [-0.2, 0.2]], 0.3, 0.72, W],
      [box(-0.09, 0.92, 0.09, 1.02), 0.62, 0.76, L],
      [box(-0.07, -0.95, 0.07, -0.86), 0.62, 0.74, R],
      [[[-0.14, 0.45], [0.14, 0.45], [0.18, 0], [0.14, -0.6], [-0.14, -0.6], [-0.18, 0]], 0.72, 0.84, G],
      [box(-0.42, 0.62, 0.42, 0.72), 0.92, 1, T],
      [box(-0.2, -0.25, 0.2, 0.2), 0.84, 1.38, N],
      [box(-0.36, 0.05, -0.2, 0.68), 1, 1.13, N],
      [box(0.2, 0.05, 0.36, 0.68), 1, 1.13, N],
      [oval(0, 0.03, 0.16), 1.38, 1.55, A],
      [oval(0, 0.05, 0.13), 1.55, 1.62, '#22B7AA'],
    ],
  },
  trot: {
    len: 1.2,
    px: 34,
    parts: [
      [box(-0.04, 0.42, 0.04, 0.62), 0, 0.2, T],
      [box(-0.04, -0.62, 0.04, -0.42), 0, 0.2, T],
      [box(-0.09, -0.5, 0.09, 0.42), 0.1, 0.2, W],
      [box(-0.03, 0.42, 0.03, 0.5), 0.2, 1.05, W2],
      [box(-0.3, 0.42, 0.3, 0.5), 1.02, 1.08, T],
      [box(-0.05, 0.47, 0.05, 0.53), 0.62, 0.68, L],
      [box(-0.05, -0.52, 0.05, -0.46), 0.14, 0.26, R],
      [box(-0.08, -0.3, 0.08, -0.02), 0.2, 0.86, N],
      [box(-0.15, -0.24, 0.15, 0.02), 0.86, 1.32, A],
      [box(-0.26, 0.0, -0.15, 0.46), 1, 1.1, A],
      [box(0.15, 0.0, 0.26, 0.46), 1, 1.1, A],
      [oval(0, -0.1, 0.12), 1.32, 1.46, W],
      [oval(0, -0.08, 0.1), 1.46, 1.52, W2],
    ],
  },
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export const VEHICLE_SOURCES: Record<string, SourceSpecification> = {
  veh: { type: 'geojson', tolerance: 0, buffer: 8, data: EMPTY },
  vehshadow: { type: 'geojson', tolerance: 0, buffer: 8, data: EMPTY },
};

/** Added last in the style: above roads, the route line and street names. */
export const VEHICLE_LAYERS: LayerSpecification[] = [
  { id: 'veh-shadow', type: 'fill', source: 'vehshadow', paint: { 'fill-color': '#000000', 'fill-opacity': 0.45 } },
  {
    id: 'veh',
    type: 'fill-extrusion',
    source: 'veh',
    paint: {
      'fill-extrusion-color': ['get', 'c'],
      'fill-extrusion-base': ['get', 'b'],
      'fill-extrusion-height': ['get', 't'],
      'fill-extrusion-vertical-gradient': true,
    },
  },
];

/** The vehicle at `pt`, pointing along `bearing` (degrees from north), sized for `zoom`. */
export function vehicleGeoJSON(kind: TripKey, pt: LngLat, bearing: number, zoom: number) {
  const M = MODELS[kind];
  const lat = (pt[1] * Math.PI) / 180;
  const metresPerPixel = (78271.5 / 2 ** zoom) * Math.cos(lat);
  const s = (M.px * metresPerPixel) / M.len;
  const th = (bearing * Math.PI) / 180;
  const ll = ([x, y]: [number, number]): [number, number] => {
    const X = (x * Math.cos(th) + y * Math.sin(th)) * s;
    const Y = (-x * Math.sin(th) + y * Math.cos(th)) * s;
    return [pt[0] + X / (111320 * Math.cos(lat)), pt[1] + Y / 110540];
  };
  const ring = (r: Ring) => {
    const out = r.map(ll);
    out.push(out[0]!);
    return out;
  };
  return {
    veh: {
      type: 'FeatureCollection' as const,
      features: M.parts.map(([poly, b, t, c]) => ({
        type: 'Feature' as const,
        properties: { b: b * s, t: t * s, c },
        geometry: { type: 'Polygon' as const, coordinates: [ring(poly)] },
      })),
    },
    shadow: {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring(oval(0, 0, M.len * (kind === 'car' ? 0.27 : 0.2), M.len * 0.53))] },
    },
  };
}
