/**
 * Night map style for the home page, drawn from our self-hosted Protomaps tiles (OpenStreetMap
 * data): dark streets, 3D buildings with lit windows, the turquoise route, street names in the
 * visitor's language, and the 3D vehicle on top of everything.
 */
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { SATELLITE_SOURCE } from '@/lib/map-credits';
import { VEHICLE_LAYERS, VEHICLE_SOURCES } from './vehicle-models';

const SRC = 'pm';
const MINOR = ['minor_road'];
const MAJOR = ['major_road'];
const HWY = ['highway'];

const width = (a: number, b: number, c: number): ExpressionSpecification => ['interpolate', ['exponential', 1.6], ['zoom'], 6, a, 12, b, 18, c];

function road(id: string, kinds: string[], color: string, w: ExpressionSpecification, minzoom: number, extra: Record<string, unknown> = {}): LayerSpecification {
  return {
    id,
    type: 'line',
    source: SRC,
    'source-layer': 'roads',
    minzoom,
    filter: ['all', ['in', ['get', 'kind'], ['literal', kinds]], ['!', ['to-boolean', ['get', 'is_tunnel']]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': w, ...extra },
  } as LayerSpecification;
}

/** Street names: Arabic names in Arabic, French (or English) names otherwise. */
function nameFor(locale: string): ExpressionSpecification {
  if (locale === 'ar') return ['coalesce', ['get', 'name:ar'], ['get', 'name']];
  if (locale === 'en') return ['coalesce', ['get', 'name:en'], ['get', 'name:fr'], ['get', 'name']];
  return ['coalesce', ['get', 'name:fr'], ['get', 'name']];
}

/** A 48 px tile of building windows, some lit; used as the walls' pattern. */
export function windowImage(): ImageData | null {
  const n = 48;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#16263C';
  g.fillRect(0, 0, n, n);
  const lit = ['#FFE3A3', '#BFE4FA', '#6F96C4'];
  let seed = 9;
  const q = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      const r = q();
      g.fillStyle = r < 0.32 ? lit[Math.floor(r * 9) % 3]! : '#0B1524';
      g.fillRect(3 + x * 16, 3 + y * 16, 10, 11);
    }
  return g.getImageData(0, 0, n, n);
}

export function nightStyle(opts: { origin: string; maxZoom: number; locale: string; satellite: boolean }): StyleSpecification {
  const sat = opts.satellite && !!SATELLITE_SOURCE;
  const name = nameFor(opts.locale);
  const halo = sat ? '#000000' : '#060F1F';
  const building = ['==', ['geometry-type'], 'Polygon'] as ExpressionSpecification;
  const height: ExpressionSpecification = ['coalesce', ['get', 'height'], 8];

  const base: LayerSpecification[] = sat
    ? [{ id: 'sat', type: 'raster', source: 'sat' }, road('s-maj', [...MAJOR, ...HWY], '#ffffff', width(0.3, 0.9, 2.5), 8, { 'line-opacity': 0.35 })]
    : [
        { id: 'earth', type: 'fill', source: SRC, 'source-layer': 'earth', paint: { 'fill-color': '#0D1B2E' } },
        {
          id: 'landuse',
          type: 'fill',
          source: SRC,
          'source-layer': 'landuse',
          filter: ['in', ['get', 'kind'], ['literal', ['park', 'grass', 'garden', 'village_green', 'forest', 'wood', 'cemetery', 'golf_course', 'nature_reserve', 'sand', 'beach']]],
          paint: { 'fill-color': ['match', ['get', 'kind'], ['sand', 'beach'], '#14191F', '#10302A'] },
        },
        { id: 'water', type: 'fill', source: SRC, 'source-layer': 'water', paint: { 'fill-color': '#0E3350' } },
        road('c-min', MINOR, '#0A1425', width(0.2, 1.3, 17), 12.5),
        road('c-maj', MAJOR, '#091222', width(0.8, 3.4, 30), 7),
        road('c-hwy', HWY, '#0A2A36', width(1.4, 5, 34), 6),
        road('min', MINOR, '#28405F', width(0.1, 0.8, 14), 12.5),
        road('maj', MAJOR, '#44668A', width(0.4, 2.2, 25), 7),
        road('hwy', HWY, '#5F86A8', width(0.8, 3, 28), 6),
        road('lane', [...MAJOR, ...HWY], '#A9C2D8', ['interpolate', ['linear'], ['zoom'], 15.5, 0.6, 18, 1.6], 15.5, { 'line-dasharray': [5, 6], 'line-opacity': 0.6 }),
        { id: 'b2d', type: 'fill', source: SRC, 'source-layer': 'buildings', minzoom: 13, filter: building, paint: { 'fill-color': '#16263C' } },
        {
          id: 'walls',
          type: 'fill-extrusion',
          source: SRC,
          'source-layer': 'buildings',
          minzoom: 14,
          filter: building,
          paint: { 'fill-extrusion-pattern': 'win', 'fill-extrusion-height': height, 'fill-extrusion-base': 0 },
        },
        {
          id: 'roofs',
          type: 'fill-extrusion',
          source: SRC,
          'source-layer': 'buildings',
          minzoom: 14,
          filter: building,
          paint: {
            'fill-extrusion-color': ['interpolate', ['linear'], height, 4, '#203754', 18, '#2C5784', 50, '#3F86A8'],
            'fill-extrusion-height': ['+', height, 0.4],
            'fill-extrusion-base': height,
          },
        },
      ];

  return {
    version: 8,
    glyphs: `${opts.origin}/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [SRC]: { type: 'vector', tiles: [`${opts.origin}/map/tiles/{z}/{x}/{y}.mvt`], minzoom: 0, maxzoom: opts.maxZoom },
      route: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      ...VEHICLE_SOURCES,
      ...(sat && SATELLITE_SOURCE ? { sat: { type: 'raster', ...SATELLITE_SOURCE } } : {}),
    },
    light: { anchor: 'map', position: [1.4, 215, 35], color: '#ffffff', intensity: 0.5 },
    sky: {
      'sky-color': '#071426',
      'horizon-color': '#17344A',
      'fog-color': '#0A1524',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': 0,
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': sat ? '#0A1524' : '#0E3350' } },
      ...base,
      {
        id: 'r-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3FE0D0', 'line-opacity': 0.3, 'line-blur': 7, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 17, 26] },
      },
      {
        id: 'r',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3FE0D0', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 17, 9] },
      },
      {
        id: 'l-road',
        type: 'symbol',
        source: SRC,
        'source-layer': 'roads',
        minzoom: 13,
        filter: ['all', ['has', 'name'], ['in', ['get', 'kind'], ['literal', [...MINOR, ...MAJOR, ...HWY]]]],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 18, 15],
          'symbol-placement': 'line',
          'text-rotation-alignment': 'map',
          'text-max-width': 8,
        },
        paint: { 'text-color': '#E8F0F7', 'text-halo-color': halo, 'text-halo-width': 1.5 },
      },
      {
        id: 'l-place',
        type: 'symbol',
        source: SRC,
        'source-layer': 'places',
        filter: ['in', ['get', 'kind'], ['literal', ['neighbourhood', 'macrohood', 'locality']]],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 16],
          'text-max-width': 8,
        },
        paint: { 'text-color': '#C7D6E5', 'text-halo-color': halo, 'text-halo-width': 1.5 },
      },
      ...VEHICLE_LAYERS,
    ],
  } as StyleSpecification;
}
