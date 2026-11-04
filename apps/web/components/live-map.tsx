'use client';

import type { LiveStatus } from '@winou/shared';
import type { Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { LiveVehicle } from '@/lib/live';
import { useI18n } from '@/lib/i18n';
import { useBaseMap } from '@/lib/map-style';

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
  const { map, ml, ready, hasBasemap } = useBaseMap(container, locale);
  const markers = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Reference place names when there is no basemap.
  useEffect(() => {
    if (!map || !ml || hasBasemap) return;
    const added = LANDMARKS.map((l) => {
      const el = document.createElement('div');
      el.className = 'pointer-events-none text-[12px] font-semibold tracking-wide text-[#7A8797] uppercase';
      el.textContent = l.name;
      return new ml.Marker({ element: el }).setLngLat(l.lngLat).addTo(map);
    });
    return () => added.forEach((m) => m.remove());
  }, [map, ml, hasBasemap]);

  // Sync vehicle markers.
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
      el.textContent = v.type === 'scooter' && v.plateFormat === 'other' ? v.plate : shortName(v.name);
      el.setAttribute('aria-label', label(v));
      el.setAttribute('aria-pressed', String(selected));
      el.className = 'rounded-full border-2 px-3 py-1 text-[13px] font-bold text-white shadow-md cursor-pointer whitespace-nowrap';
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

  // Fly to the selected vehicle, keeping it clear of the details card.
  const selected = vehicles.find((x) => x.vehicleId === selectedId);
  const selectedPos = selected?.position ? `${selected.position.lon},${selected.position.lat}` : null;
  const flownTo = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !ready || !selectedId || !selectedPos || flownTo.current === selectedId) return;
    flownTo.current = selectedId;
    fitted.current = true;
    const [lon, lat] = selectedPos.split(',').map(Number) as [number, number];
    const wide = window.innerWidth >= 640;
    const rtl = document.documentElement.dir === 'rtl';
    const offset: [number, number] = wide ? [rtl ? 200 : -200, -40] : [0, -120];
    map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 13), offset, duration: 600 });
  }, [map, ready, selectedId, selectedPos]);
  useEffect(() => {
    if (!selectedId) flownTo.current = null;
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
