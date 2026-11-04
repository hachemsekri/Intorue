'use client';

import type { GeofenceDto, GeofenceShape } from '@winou/shared';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { useBaseMap } from '@/lib/map-style';

type Draft = { kind: 'circle'; center: [number, number] | null; radiusM: number } | { kind: 'polygon'; points: [number, number][] };

/** Approximate circle ring for previewing (the API stores the exact buffered polygon). */
function circleRing(center: [number, number], radiusM: number, steps = 64): [number, number][] {
  const [lon, lat] = center;
  const dLat = radiusM / 110_540;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)] as [number, number];
  });
}

export function draftToShape(d: Draft): GeofenceShape | null {
  if (d.kind === 'circle') return d.center ? { kind: 'circle', center: d.center, radiusM: Math.round(d.radiusM) } : null;
  return d.points.length >= 3 ? { kind: 'polygon', points: d.points } : null;
}
export type { Draft };

/**
 * Map showing the organization's zones. When `draft` is set, clicks edit it:
 * circle = place the centre, polygon = add a corner.
 */
export function ZoneEditor({
  zones,
  draft,
  onDraftChange,
  selectedId,
  onSelect,
}: {
  zones: GeofenceDto[];
  draft: Draft | null;
  onDraftChange: (d: Draft) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready } = useBaseMap(container, locale, { zoom: 10 });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const changeRef = useRef(onDraftChange);
  changeRef.current = onDraftChange;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const fitted = useRef(false);

  // Layers, once.
  useEffect(() => {
    if (!map || !ready) return;
    const empty = { type: 'FeatureCollection' as const, features: [] };
    map.addSource('zones', { type: 'geojson', data: empty });
    map.addSource('draft', { type: 'geojson', data: empty });
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['case', ['get', 'selected'], '#14B8A6', '#3F6EA8'], 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['case', ['get', 'selected'], '#0E7C7B', '#3F6EA8'], 'line-width': 2 } });
    map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#C2540A', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#C2540A', 'line-width': 2.5, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draft-points', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#C2540A', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });

    const onClick = (e: MapMouseEvent) => {
      const d = draftRef.current;
      const p: [number, number] = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
      if (d) {
        changeRef.current(d.kind === 'circle' ? { ...d, center: p } : { ...d, points: [...d.points, p] });
        return;
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] })[0];
      if (hit?.properties?.id) selectRef.current(String(hit.properties.id));
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, ready]);

  // Existing zones.
  useEffect(() => {
    if (!map || !ml || !ready) return;
    (map.getSource('zones') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: zones.map((z) => ({ type: 'Feature', properties: { id: z.id, selected: z.id === selectedId }, geometry: { type: 'Polygon', coordinates: [z.ring] } })),
    });
    if (!fitted.current && zones.length) {
      const all = zones.flatMap((z) => z.ring);
      const b = new ml.LngLatBounds(all[0], all[0]);
      all.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 40, maxZoom: 14, duration: 0 });
      fitted.current = true;
    }
  }, [map, ml, ready, zones, selectedId]);

  // Draft preview.
  useEffect(() => {
    if (!map || !ready) return;
    const features: { type: 'Feature'; properties: object; geometry: { type: 'Polygon' | 'Point' | 'LineString'; coordinates: unknown } }[] = [];
    if (draft?.kind === 'circle' && draft.center) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(draft.center, draft.radiusM)] } });
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: draft.center } });
    }
    if (draft?.kind === 'polygon') {
      for (const p of draft.points) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } });
      if (draft.points.length >= 3) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...draft.points, draft.points[0]]] } });
      else if (draft.points.length === 2) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft.points } });
    }
    (map.getSource('draft') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features } as Parameters<GeoJSONSource['setData']>[0]);
    map.getCanvas().style.cursor = draft ? 'crosshair' : '';
  }, [map, ready, draft]);

  return <div ref={container} className="h-full w-full" role="region" aria-label={t('zones.title')} />;
}
