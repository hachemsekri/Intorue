'use client';

import { mapProvider } from '@winou/config';
import type { LiveStatus } from '@winou/shared';
import type { Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { LiveVehicle } from '@/lib/live';
import { useI18n } from '@/lib/i18n';

/** "auto" = self-hosted Tunisia basemap if installed (scripts/fetch-basemap.mjs), else a plain background. */
const STYLE_SETTING = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'auto';
const TUNIS: [number, number] = [10.1815, 36.8065];

export const STATUS_COLOR: Record<LiveStatus, string> = {
  moving: '#0E8A87',
  stopped: '#3F6EA8',
  offline: '#6B7785',
  never: '#94A0AE',
  no_device: '#94A0AE',
};

/** Orientation points shown when no basemap is installed (approximate centres). */
const LANDMARKS: { name: string; lngLat: [number, number] }[] = [
  { name: 'Tunis', lngLat: [10.1815, 36.8008] },
  { name: 'La Marsa', lngLat: [10.3247, 36.8782] },
  { name: 'Ariana', lngLat: [10.1956, 36.8665] },
  { name: 'Ben Arous', lngLat: [10.2281, 36.7532] },
  { name: 'La Goulette', lngLat: [10.3049, 36.8186] },
  { name: 'Hammamet', lngLat: [10.6151, 36.4005] },
  { name: 'Bardo', lngLat: [10.1342, 36.8091] },
];

interface ResolvedStyle {
  style: StyleSpecification | string;
  attribution: string;
  hasBasemap: boolean;
}

const PLAIN: ResolvedStyle = {
  hasBasemap: false,
  attribution: 'Winou · fond de carte non configuré',
  style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#EDF1F5' } }] },
};

/** Self-hosted Protomaps basemap (OSM data), recoloured to match the product palette. */
async function protomapsLocal(locale: string): Promise<ResolvedStyle | null> {
  const meta = await fetch('/map/basemap.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!meta) return null;
  const { layers, namedFlavor } = await import('@protomaps/basemaps');
  const origin = window.location.origin;
  const flavor = {
    ...namedFlavor('light'),
    background: '#EEF2F6',
    earth: '#EEF2F6',
    water: '#BFE3E7',
    park_a: '#DCEBDD',
    park_b: '#D3E6D4',
  };
  const attribution = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
  return {
    hasBasemap: true,
    attribution: '',
    style: {
      version: 8,
      glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/map/sprites/light`,
      sources: {
        protomaps: {
          type: 'vector',
          tiles: [`${origin}/map/tiles/{z}/{x}/{y}.mvt`],
          minzoom: 0,
          maxzoom: Number(meta.maxZoom ?? 15),
          attribution,
        },
      },
      layers: layers('protomaps', flavor, { lang: locale === 'ar' ? 'ar' : locale === 'en' ? 'en' : 'fr' }),
    },
  };
}

async function resolveStyle(locale: string): Promise<ResolvedStyle> {
  if (STYLE_SETTING === 'none') return PLAIN;
  if (STYLE_SETTING === 'auto' || STYLE_SETTING === 'protomaps-local') return (await protomapsLocal(locale)) ?? PLAIN;
  const p = mapProvider('custom', { styleUrl: STYLE_SETTING });
  return { hasBasemap: true, attribution: p.attribution, style: p.styleUrl };
}

export function LiveMap({
  vehicles,
  selectedId,
  onSelect,
  label,
}: {
  vehicles: LiveVehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: (v: LiveVehicle) => string;
}) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [hasBasemap, setHasBasemap] = useState(true);
  const ml = useRef<typeof import('maplibre-gl') | null>(null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([import('maplibre-gl'), resolveStyle(locale)]).then(([mod, cfg]) => {
      if (cancelled || !container.current) return;
      ml.current = mod;
      setHasBasemap(cfg.hasBasemap);
      // Correct shaping and direction of Arabic labels (self-hosted copy of the official plugin).
      if (mod.getRTLTextPluginStatus() === 'unavailable') {
        void mod.setRTLTextPlugin('/vendor/mapbox-gl-rtl-text.js', true).catch(() => {});
      }
      const m = new mod.Map({
        container: container.current,
        style: cfg.style,
        center: TUNIS,
        zoom: 11,
        attributionControl: false,
        cooperativeGestures: false,
      });
      m.addControl(new mod.AttributionControl({ compact: false, ...(cfg.attribution ? { customAttribution: cfg.attribution } : {}) }), 'bottom-left');
      // Outside the downloaded area, deep-zoom tiles do not exist: ignore those 404s.
      m.on('error', (e) => {
        const msg = String((e as { error?: Error }).error?.message ?? '');
        if (!msg.includes('/map/tiles/')) console.error('[map]', msg || e);
      });
      m.addControl(new mod.NavigationControl({ showCompass: false }), 'bottom-right');
      if (!cfg.hasBasemap) {
        for (const l of LANDMARKS) {
          const el = document.createElement('div');
          el.className = 'pointer-events-none text-[12px] font-semibold tracking-wide text-[#7A8797] uppercase';
          el.textContent = l.name;
          new mod.Marker({ element: el }).setLngLat(l.lngLat).addTo(m);
        }
      }
      m.on('load', () => setReady(true));
      if (process.env.NODE_ENV !== 'production') (window as unknown as { __winouMap?: MlMap }).__winouMap = m; // dev debugging
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync vehicle markers.
  useEffect(() => {
    const m = map.current;
    const mod = ml.current;
    if (!m || !mod || !ready) return;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (!v.position) continue;
      seen.add(v.vehicleId);
      let marker = markers.current.get(v.vehicleId);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(v.vehicleId);
        });
        marker = new mod.Marker({ element: el, anchor: 'center' }).setLngLat([v.position.lon, v.position.lat]).addTo(m);
        markers.current.set(v.vehicleId, marker);
      }
      marker.setLngLat([v.position.lon, v.position.lat]);
      const el = marker.getElement() as HTMLButtonElement;
      const selected = v.vehicleId === selectedId;
      el.textContent = v.type === 'scooter' && v.plateFormat === 'other' ? v.plate : shortName(v.name);
      el.setAttribute('aria-label', label(v));
      el.setAttribute('aria-pressed', String(selected));
      el.className =
        'rounded-full border-2 px-3 py-1 text-[13px] font-bold text-white shadow-md transition-[outline] cursor-pointer whitespace-nowrap';
      el.style.background = STATUS_COLOR[v.status];
      el.style.borderColor = '#fff';
      el.style.outline = selected ? '3px solid #0E2A47' : 'none';
      el.style.zIndex = selected ? '10' : '1';
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
    if (!fitted.current) {
      const pts = vehicles.filter((v) => v.position).map((v) => [v.position!.lon, v.position!.lat] as [number, number]);
      if (pts.length) {
        const b = new mod.LngLatBounds(pts[0], pts[0]);
        pts.forEach((p) => b.extend(p));
        m.fitBounds(b, { padding: 80, maxZoom: 14, duration: 0 });
        fitted.current = true;
      }
    }
  }, [vehicles, selectedId, ready, label]);

  // Keep the latest callback without recreating markers.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Fly to the selected vehicle.
  useEffect(() => {
    const v = vehicles.find((x) => x.vehicleId === selectedId);
    if (map.current && v?.position) {
      // Keep the vehicle clear of the details card (bottom-end on wide screens, bottom on phones).
      const wide = window.innerWidth >= 640;
      const rtl = document.documentElement.dir === 'rtl';
      const offset: [number, number] = wide ? [rtl ? 200 : -200, -40] : [0, -120];
      map.current.easeTo({ center: [v.position.lon, v.position.lat], offset, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" role="region" aria-label={t('nav.map')} />
      {!hasBasemap && (
        <p className="pointer-events-none absolute end-14 bottom-8 max-w-xs rounded-lg bg-white/90 px-3 py-2 text-xs text-muted shadow-sm">
          {t('map.basemapMissing')}
        </p>
      )}
    </div>
  );
}

function shortName(name: string) {
  const parts = name.split(' ');
  return parts.length > 1 && parts[0]!.length > 2 ? parts.slice(1).join(' ') : name;
}
