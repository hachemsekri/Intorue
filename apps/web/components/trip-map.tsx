'use client';

import type { AlertDto, TripDto } from '@winou/shared';
import type { GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useBaseMap } from '@/lib/map-style';

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Route(s) of the selected period from the vehicle's recorded positions: turquoise line,
 * ink start, turquoise end, and alert markers. Layers are re-added after a theme change.
 */
export function TripMap({ trips, events, selectedId }: { trips: TripDto[]; events: AlertDto[]; selectedId: string | null }) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready, styleVersion } = useBaseMap(container, locale);
  const markers = useRef<Marker[]>([]);
  const lastFit = useRef('');

  useEffect(() => {
    if (!map || !ml || !ready) return;
    const shown = selectedId ? trips.filter((x) => x.id === selectedId) : trips;
    const data: Parameters<GeoJSONSource['setData']>[0] = {
      type: 'FeatureCollection',
      features: shown.map((tr) => ({ type: 'Feature', properties: { id: tr.id }, geometry: { type: 'LineString', coordinates: tr.path } })),
    };
    const src = map.getSource('trips') as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource('trips', { type: 'geojson', data });
      map.addLayer({ id: 'trips-casing', type: 'line', source: 'trips', paint: { 'line-color': cssVar('--map-casing', '#ffffff'), 'line-width': 11 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'trips-line', type: 'line', source: 'trips', paint: { 'line-color': cssVar('--map-route', '#0A8079'), 'line-width': 6 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }

    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const dot = (bg: string, size: number, title: string) => {
      const el = document.createElement('div');
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid var(--surf);box-shadow:0 1px 6px rgba(0,0,0,.35)`;
      el.title = title;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', title);
      return el;
    };
    for (const tr of shown) {
      markers.current.push(new ml.Marker({ element: dot('var(--ink)', 18, t('trips.departure')) }).setLngLat([tr.start.lon, tr.start.lat]).addTo(map));
      markers.current.push(new ml.Marker({ element: dot('var(--acc)', 18, tr.ongoing ? t('trips.currentPosition') : t('trips.arrival')) }).setLngLat([tr.end.lon, tr.end.lat]).addTo(map));
    }
    const inShown = (e: AlertDto) => !selectedId || shown.some((tr) => e.occurredAt >= tr.startedAt && e.occurredAt <= tr.endedAt);
    for (const e of events.filter((x) => x.position && inShown(x))) {
      markers.current.push(new ml.Marker({ element: dot('var(--warn)', 16, t(`alerts.types.${e.type}`)) }).setLngLat([e.position!.lon, e.position!.lat]).addTo(map));
    }

    // Frame the routes when the selection changes (not after a mere theme change).
    const key = `${selectedId}|${shown.map((s) => s.id).join(',')}`;
    const coords = shown.flatMap((tr) => tr.path);
    if (coords.length && key !== lastFit.current) {
      lastFit.current = key;
      const b = new ml.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 400 });
    }
  }, [map, ml, ready, trips, events, selectedId, t, styleVersion]);

  useEffect(() => () => markers.current.forEach((m) => m.remove()), []);

  return <div ref={container} className="h-full w-full" role="region" aria-label={t('trips.title')} />;
}
