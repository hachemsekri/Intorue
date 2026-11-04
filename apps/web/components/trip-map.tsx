'use client';

import type { AlertDto, TripDto } from '@winou/shared';
import type { GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useBaseMap } from '@/lib/map-style';

/** Route(s) of the selected period: teal lines, navy start, teal end, orange events. */
export function TripMap({ trips, events, selectedId }: { trips: TripDto[]; events: AlertDto[]; selectedId: string | null }) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready } = useBaseMap(container, locale);
  const markers = useRef<Marker[]>([]);

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
      map.addLayer({ id: 'trips-casing', type: 'line', source: 'trips', paint: { 'line-color': '#ffffff', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'trips-line', type: 'line', source: 'trips', paint: { 'line-color': '#0E7C7B', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }

    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const dot = (color: string, size: number, title: string) => {
      const el = document.createElement('div');
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)`;
      el.title = title;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', title);
      return el;
    };
    for (const tr of shown) {
      markers.current.push(new ml.Marker({ element: dot('#0B2440', 18, t('trips.departure')) }).setLngLat([tr.start.lon, tr.start.lat]).addTo(map));
      markers.current.push(new ml.Marker({ element: dot('#0E8A87', 18, tr.ongoing ? t('trips.currentPosition') : t('trips.arrival')) }).setLngLat([tr.end.lon, tr.end.lat]).addTo(map));
    }
    const inShown = (e: AlertDto) =>
      !selectedId || shown.some((tr) => e.occurredAt >= tr.startedAt && e.occurredAt <= tr.endedAt);
    for (const e of events.filter((x) => x.position && inShown(x))) {
      markers.current.push(new ml.Marker({ element: dot('#C2540A', 16, t(`alerts.types.${e.type}`)) }).setLngLat([e.position!.lon, e.position!.lat]).addTo(map));
    }

    const coords = shown.flatMap((tr) => tr.path);
    if (coords.length) {
      const b = new ml.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 400 });
    }
  }, [map, ml, ready, trips, events, selectedId, t]);

  return <div ref={container} className="h-full w-full" role="region" aria-label={t('trips.title')} />;
}
