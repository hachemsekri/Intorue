'use client';

import { mapProvider } from '@winou/config';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type RefObject } from 'react';

/** "auto" = self-hosted Tunisia basemap if installed (scripts/fetch-basemap.mjs), else a plain background. */
const STYLE_SETTING = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'auto';
export const TUNIS: [number, number] = [10.1815, 36.8065];

export interface ResolvedStyle {
  style: StyleSpecification | string;
  attribution: string;
  hasBasemap: boolean;
}

const PLAIN: ResolvedStyle = {
  hasBasemap: false,
  attribution: 'Intorue · fond de carte non configuré',
  style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EDF1F5' } }] },
};

/** Self-hosted Protomaps basemap (OSM data), recoloured to match the product palette. */
async function protomapsLocal(locale: string): Promise<ResolvedStyle | null> {
  const meta = await fetch('/map/basemap.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!meta) return null;
  const { layers, namedFlavor } = await import('@protomaps/basemaps');
  const origin = window.location.origin;
  const flavor = { ...namedFlavor('light'), background: '#EEF2F6', earth: '#EEF2F6', water: '#BFE3E7', park_a: '#DCEBDD', park_b: '#D3E6D4' };
  const attribution =
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
  return {
    hasBasemap: true,
    attribution: '',
    style: {
      version: 8,
      glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/map/sprites/light`,
      sources: {
        protomaps: { type: 'vector', tiles: [`${origin}/map/tiles/{z}/{x}/{y}.mvt`], minzoom: 0, maxzoom: Number(meta.maxZoom ?? 15), attribution },
      },
      layers: layers('protomaps', flavor, { lang: locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'fr' }),
    },
  };
}

export async function resolveStyle(locale: string): Promise<ResolvedStyle> {
  if (STYLE_SETTING === 'none') return PLAIN;
  if (STYLE_SETTING === 'auto' || STYLE_SETTING === 'protomaps-local') return (await protomapsLocal(locale)) ?? PLAIN;
  const p = mapProvider('custom', { styleUrl: STYLE_SETTING });
  return { hasBasemap: true, attribution: p.attribution, style: p.styleUrl };
}

/**
 * Creates a MapLibre map in `container` with the configured basemap, attribution, zoom
 * buttons and the right-to-left text plugin for Arabic labels.
 */
export function useBaseMap(
  container: RefObject<HTMLDivElement | null>,
  locale: string,
  opts: { center?: [number, number]; zoom?: number; controls?: boolean; compactAttribution?: boolean } = {},
) {
  const [map, setMap] = useState<MlMap | null>(null);
  const [ml, setMl] = useState<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const [hasBasemap, setHasBasemap] = useState(true);
  const optsRef = useRef(opts);

  useEffect(() => {
    let cancelled = false;
    let created: MlMap | null = null;
    void Promise.all([import('maplibre-gl'), resolveStyle(locale)]).then(([mod, cfg]) => {
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
      });
      m.addControl(
        new mod.AttributionControl({ compact: !!optsRef.current.compactAttribution, ...(cfg.attribution ? { customAttribution: cfg.attribution } : {}) }),
        'bottom-left',
      );
      if (optsRef.current.controls !== false) m.addControl(new mod.NavigationControl({ showCompass: false }), 'bottom-right');
      // Outside the downloaded area, deep-zoom tiles do not exist: ignore those 404s.
      m.on('error', (e) => {
        const msg = String((e as { error?: Error }).error?.message ?? '');
        if (!msg.includes('/map/tiles/')) console.error('[map]', msg || e);
      });
      // Ready once the style is parsed: a missing glyph range (rare scripts in OSM names) can delay "load" forever.
      m.once('style.load', () => setReady(true));
      m.once('load', () => setReady(true));
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __winouMap?: MlMap }).__winouMap = m; // dev debugging
      created = m;
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
    };
  }, [container, locale]);

  return { map, ml, ready, hasBasemap };
}
