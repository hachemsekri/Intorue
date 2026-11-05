'use client';

import { mapProvider, THEMES, type ThemeName } from '@winou/config';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTheme } from './theme';
import { MAP_CREDITS } from './map-credits';

/** "auto" = self-hosted Tunisia basemap if installed (scripts/fetch-basemap.mjs), else a plain background. */
const STYLE_SETTING = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'auto';
export const TUNIS: [number, number] = [10.1815, 36.8065];

export interface ResolvedStyle {
  style: StyleSpecification | string;
  attribution: string;
  hasBasemap: boolean;
}

const plain = (theme: ThemeName): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': THEMES[theme].map.land } }],
});
const PLAIN: ResolvedStyle = { hasBasemap: false, attribution: '', style: plain('light') };

/** Map colours per theme, from the shared design tokens (packages/config). */
function flavorFor(theme: ThemeName, base: Record<string, unknown>) {
  const m = THEMES[theme].map;
  const dark = theme === 'dark';
  return {
    ...base,
    background: m.water,
    earth: m.land,
    water: m.water,
    park_a: m.green,
    park_b: m.green,
    wood_a: m.green,
    wood_b: m.green,
    scrub_a: m.green,
    scrub_b: m.green,
    buildings: m.block,
    minor_a: m.road,
    minor_b: m.road,
    minor_service: m.road,
    other: m.road,
    link: m.roadMajor,
    major: m.roadMajor,
    highway: m.roadMajor,
    minor_casing: m.casing,
    minor_service_casing: m.casing,
    major_casing_early: m.casing,
    major_casing_late: m.casing,
    highway_casing_early: m.casing,
    highway_casing_late: m.casing,
    link_casing: m.casing,
    roads_label_minor: m.label,
    roads_label_major: m.label,
    roads_label_minor_halo: m.halo,
    roads_label_major_halo: m.halo,
    subplace_label: m.label,
    subplace_label_halo: m.halo,
    city_label: dark ? '#F3F7FC' : '#0B1B33',
    city_label_halo: m.halo,
    state_label: m.label,
    state_label_halo: m.halo,
    address_label: m.label,
    address_label_halo: m.halo,
  };
}

/** Self-hosted Protomaps basemap (OSM data), coloured with the app's light or dark theme. */
async function protomapsLocal(locale: string, theme: ThemeName): Promise<ResolvedStyle | null> {
  const meta = await loadMeta();
  if (!meta) return null;
  const { layers, namedFlavor } = await import('@protomaps/basemaps');
  const origin = window.location.origin;
  return {
    hasBasemap: true,
    // Credits are listed in one place (lib/map-credits.ts) and shown under the app's maps.
    attribution: '',
    style: {
      version: 8,
      glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/map/sprites/light`,
      sources: {
        protomaps: { type: 'vector', tiles: [`${origin}/map/tiles/{z}/{x}/{y}.mvt`], minzoom: 0, maxzoom: Number(meta.maxZoom ?? 15) },
      },
      layers: layers('protomaps', flavorFor(theme, namedFlavor(theme) as unknown as Record<string, unknown>) as never, {
        lang: locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'fr',
      }),
    },
  };
}

interface BasemapMeta {
  maxZoom?: number;
  areas?: { bbox: [number, number, number, number]; maxZoom: number }[];
}

/**
 * Tiles are downloaded at different depths per area (streets for Grand Tunis, less elsewhere).
 * Zooming past what exists at a place would show an empty map, so the zoom is capped there.
 * Below the deepest level, ".99" still uses the tiles of that level (MapLibre rounds down).
 */
export function coverageMaxZoom(meta: BasemapMeta | null, lon: number, lat: number): number {
  const deepest = Number(meta?.maxZoom ?? 15);
  const here = (meta?.areas ?? []).filter(({ bbox: [w, s, e, n] }) => lon >= w && lon <= e && lat >= s && lat <= n).map((a) => a.maxZoom);
  if (!here.length) return 22; // no coverage data for this place: leave zoom free
  const best = Math.max(...here);
  return best >= deepest ? 22 : best + 0.99;
}

let metaPromise: Promise<BasemapMeta | null> | null = null;
const loadMeta = () =>
  (metaPromise ??= fetch('/map/basemap.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null));

export async function resolveStyle(locale: string, theme: ThemeName = 'light'): Promise<ResolvedStyle> {
  if (STYLE_SETTING === 'none') return { ...PLAIN, style: plain(theme) };
  if (STYLE_SETTING === 'auto' || STYLE_SETTING === 'protomaps-local') return (await protomapsLocal(locale, theme)) ?? { ...PLAIN, style: plain(theme) };
  const p = mapProvider('custom', { styleUrl: STYLE_SETTING });
  return { hasBasemap: true, attribution: p.attribution, style: p.styleUrl };
}

/**
 * Creates a MapLibre map in `container` with the configured basemap, in the current light or
 * dark theme, plus compact map credits, zoom buttons and the right-to-left text plugin for
 * Arabic labels. A theme change restyles the same map; `styleVersion` changes after each new
 * style so callers can add their own layers again. The map is removed on unmount.
 */
export function useBaseMap(
  container: RefObject<HTMLDivElement | null>,
  locale: string,
  opts: { center?: [number, number]; zoom?: number; controls?: boolean; theme?: ThemeName; interactive?: boolean } = {},
) {
  const { theme: pageTheme } = useTheme();
  const theme = opts.theme ?? pageTheme;
  const [map, setMap] = useState<MlMap | null>(null);
  const [ml, setMl] = useState<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [hasBasemap, setHasBasemap] = useState(true);
  const optsRef = useRef(opts);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const styledWith = useRef<ThemeName | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: MlMap | null = null;
    const startTheme = themeRef.current;
    void Promise.all([import('maplibre-gl'), resolveStyle(locale, startTheme)]).then(([mod, cfg]) => {
      if (cancelled || !container.current) return;
      if (mod.getRTLTextPluginStatus() === 'unavailable') {
        void mod.setRTLTextPlugin('/vendor/mapbox-gl-rtl-text.js', true).catch(() => {});
      }
      const m = new mod.Map({
        container: container.current,
        style: cfg.style,
        center: optsRef.current.center ?? TUNIS,
        zoom: optsRef.current.zoom ?? 11,
        attributionControl: false,
        interactive: optsRef.current.interactive !== false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
      styledWith.current = startTheme;
      if (cfg.hasBasemap) m.addControl(new mod.AttributionControl({ compact: true, customAttribution: creditsHtml() }), 'bottom-left');
      if (optsRef.current.controls !== false) m.addControl(new mod.NavigationControl({ showCompass: false }), 'bottom-right');
      // Outside the downloaded area, deep-zoom tiles do not exist: ignore those 404s.
      m.on('error', (e) => {
        const msg = String((e as { error?: Error }).error?.message ?? '');
        if (!msg.includes('/map/tiles/')) console.warn('[map]', msg || e);
      });
      // Ready once the style is parsed: a missing glyph range (rare scripts in OSM names) can delay "load" forever.
      m.on('style.load', () => {
        setReady(true);
        setStyleVersion((v) => v + 1);
      });
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __winouMap?: MlMap }).__winouMap = m; // dev debugging
      created = m;
      // Never zoom past the tiles available where the map is looking.
      void loadMeta().then((meta) => {
        if (cancelled || !meta) return;
        const cap = () => {
          const c = m.getCenter();
          m.setMaxZoom(coverageMaxZoom(meta, c.lng, c.lat));
        };
        m.on('moveend', cap);
        cap();
      });
      // Follow the container's size (it may be laid out after the map is created).
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(container.current);
      m.once('remove', () => ro.disconnect());
      setHasBasemap(cfg.hasBasemap);
      setMl(mod);
      setMap(m);
    });
    return () => {
      cancelled = true;
      created?.remove();
      setMap(null);
      setReady(false);
    };
  }, [container, locale]);

  // Theme change: restyle the existing map (markers stay; layers are re-added via styleVersion).
  useEffect(() => {
    if (!map || styledWith.current === theme) return;
    let cancelled = false;
    void resolveStyle(locale, theme).then((cfg) => {
      if (cancelled) return;
      styledWith.current = theme;
      map.setStyle(cfg.style as StyleSpecification, { diff: false });
    });
    return () => {
      cancelled = true;
    };
  }, [map, theme, locale]);

  return { map, ml, ready, hasBasemap, styleVersion, theme };
}

function creditsHtml() {
  return MAP_CREDITS.map((c) => `<a href="${c.href}" target="_blank" rel="noopener noreferrer">${c.label}</a>`).join(' · ');
}
