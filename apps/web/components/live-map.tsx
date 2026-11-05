'use client';

import type { LiveStatus, VehicleType } from '@winou/shared';
import type { GeoJSONSource, Map as MlMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useEffect, useRef } from 'react';
import type { LiveVehicle } from '@/lib/live';
import { useI18n } from '@/lib/i18n';
import { useBaseMap } from '@/lib/map-style';

export interface Street {
  fr: string;
  ar: string;
}

const ICON: Record<VehicleType, string> = {
  car: 'M5 16h14l-1.5-6a2 2 0 0 0-2-1.5h-7a2 2 0 0 0-2 1.5zM7 19v-3M17 19v-3',
  motorcycle: 'M5 17a3 3 0 1 0 0-.01zM19 17a3 3 0 1 0 0-.01zM5 17l5-7h4l5 7M13 6h3',
  scooter: 'M7 19a2 2 0 1 0 0-.01zM18 19a2 2 0 1 0 0-.01zM9 19h7L13 5h-3',
};

/** Status ring: a dashed ring for offline, so status never relies on colour alone. */
const RING: Record<LiveStatus, string> = {
  moving: 'var(--moving)',
  stopped: 'var(--stopped)',
  offline: 'var(--offline)',
  never: 'var(--offline)',
  no_device: 'var(--offline)',
};

/**
 * The fleet on the real map. Markers update in place as positions arrive; the selected vehicle
 * gets the camera, its route of the day (from its trips) and the street it is on (read from
 * our own map tiles, for the plaque).
 */
export const LiveMap = memo(function LiveMap({
  vehicles,
  selectedId,
  onSelect,
  label,
  route,
  onStreet,
}: {
  vehicles: LiveVehicle[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: (v: LiveVehicle) => string;
  /** the selected vehicle's trips today, each a [lon, lat] line */
  route: [number, number][][] | null;
  onStreet: (s: Street | null) => void;
}) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready, styleVersion, hasBasemap } = useBaseMap(container, locale);
  const markers = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onStreetRef = useRef(onStreet);
  onStreetRef.current = onStreet;

  // A new map (or language): start from clean markers.
  useEffect(() => {
    const m = markers.current;
    return () => {
      m.forEach((mk) => mk.remove());
      m.clear();
      fitted.current = false;
    };
  }, [map]);

  // Vehicle markers, updated in place.
  useEffect(() => {
    if (!map || !ml || !ready) return;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (!v.position) continue;
      seen.add(v.vehicleId);
      let marker = markers.current.get(v.vehicleId);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'intorue-marker';
        const id = v.vehicleId;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(id);
        });
        marker = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([v.position.lon, v.position.lat]).addTo(map);
        markers.current.set(v.vehicleId, marker);
      }
      marker.setLngLat([v.position.lon, v.position.lat]);
      const el = marker.getElement() as HTMLButtonElement;
      const selected = v.vehicleId === selectedId;
      const key = `${v.type}|${v.status}|${selected}`;
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.innerHTML = `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[v.type]}"/></svg>`;
        el.setAttribute('aria-pressed', String(selected));
        el.dataset.status = v.status;
        el.style.setProperty('--ring', RING[v.status]);
        el.style.zIndex = selected ? '10' : '1';
      }
      el.setAttribute('aria-label', label(v));
    }
    for (const [id, mk] of markers.current) {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
    if (!fitted.current && !selectedId) {
      const pts = vehicles.filter((v) => v.position).map((v) => [v.position!.lon, v.position!.lat] as [number, number]);
      if (pts.length) {
        const b = new ml.LngLatBounds(pts[0], pts[0]);
        pts.forEach((p) => b.extend(p));
        map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 0 });
        fitted.current = true;
      }
    }
  }, [vehicles, selectedId, ready, label, map, ml]);

  // The selected vehicle's route today.
  useEffect(() => {
    if (!map || !ready) return;
    const data = {
      type: 'FeatureCollection' as const,
      features: (route ?? []).filter((l) => l.length > 1).map((l) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: l } })),
    };
    const src = map.getSource('sel-route') as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource('sel-route', { type: 'geojson', data });
      map.addLayer({
        id: 'sel-route',
        type: 'line',
        source: 'sel-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': getComputedStyle(document.documentElement).getPropertyValue('--map-route').trim() || '#0A8079', 'line-width': 6 },
      });
    }
  }, [map, ready, route, styleVersion]);

  // Fly to the selected vehicle, keeping it clear of the details card; then read its street.
  const selected = vehicles.find((x) => x.vehicleId === selectedId);
  const selectedPos = selected?.position ? `${selected.position.lon},${selected.position.lat}` : null;
  const flownTo = useRef<string | null>(null);
  const following = useRef(true);
  // Dragging the map means "let me look around": stop following until a vehicle is picked again.
  useEffect(() => {
    if (!map) return;
    const stop = () => {
      following.current = false;
    };
    map.on('dragstart', stop);
    return () => {
      map.off('dragstart', stop);
    };
  }, [map]);
  useEffect(() => {
    if (!map || !ready || !selectedId || !selectedPos) {
      if (!selectedId) flownTo.current = null;
      onStreetRef.current(null);
      return;
    }
    const [lon, lat] = selectedPos.split(',').map(Number) as [number, number];
    if (flownTo.current !== selectedId) {
      flownTo.current = selectedId;
      fitted.current = true;
      // Keep the vehicle clear of the details card (on phones the card is below the map).
      const w = window.innerWidth;
      const rtl = document.documentElement.dir === 'rtl';
      const offset: [number, number] = w >= 900 ? [rtl ? 180 : -180, -40] : w >= 640 ? [0, -80] : [0, 0];
      following.current = true;
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), offset, duration: 600 });
    } else if (following.current && !map.isMoving()) {
      // Keep a moving vehicle in view: recentre when it nears the edge of the map.
      const pt = map.project([lon, lat]);
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const mx = w * 0.15;
      const my = h * 0.15;
      if (pt.x < mx || pt.x > w - mx || pt.y < my || pt.y > h - my) map.easeTo({ center: [lon, lat], duration: 600 });
    }
    const read = () => onStreetRef.current(streetAt(map, lon, lat));
    if (map.isMoving() || !map.areTilesLoaded()) map.once('idle', read);
    else read();
    return () => {
      map.off('idle', read);
    };
  }, [map, ready, selectedId, selectedPos, styleVersion]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" role="region" aria-label={t('nav.map')} />
      {!hasBasemap && (
        <p className="pointer-events-none absolute end-14 bottom-8 max-w-xs rounded-xl bg-surface px-3 py-2 text-xs text-muted">{t('map.basemapMissing')}</p>
      )}
    </div>
  );
});

/** Name of the road under (or nearest to) a point, from the rendered map tiles. */
function streetAt(map: MlMap, lon: number, lat: number): Street | null {
  const p = map.project([lon, lat]);
  const r = 22;
  let best: { d: number; s: Street } | null = null;
  for (const f of map.queryRenderedFeatures([
    [p.x - r, p.y - r],
    [p.x + r, p.y + r],
  ])) {
    if (f.sourceLayer !== 'roads') continue;
    const props = f.properties as Record<string, string | undefined>;
    const fr = props['name:fr'] || props.name;
    if (!fr) continue;
    const ar = props['name:ar'] || (props.script === 'Arabic' ? props.name : '') || '';
    const d = nearestDistance(map, f.geometry, p.x, p.y);
    if (!best || d < best.d) best = { d, s: { fr, ar } };
  }
  return best?.s ?? null;
}

function nearestDistance(map: MlMap, g: { type: string; coordinates?: unknown }, x: number, y: number): number {
  const c = g.coordinates as number[][] & number[][][];
  const lines: number[][][] = g.type === "LineString" ? [c as number[][]] : g.type === "MultiLineString" ? (c as number[][][]) : [];
  let d = Infinity;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const a = map.project(line[i - 1] as [number, number]);
      const b = map.project(line[i] as [number, number]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      d = Math.min(d, Math.hypot(a.x + k * dx - x, a.y + k * dy - y));
    }
  return d;
}
