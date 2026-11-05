'use client';

/**
 * Map for the mobile app (shown in a WebView, or an iframe in the Expo web preview).
 * It holds no session and loads no customer data itself: the app posts what to draw.
 *
 *   app → page: { type: 'vehicles', vehicles: [{ id, label, color, lon, lat, selected }] }
 *               { type: 'route', paths: [[lon, lat][]], points: [{ lon, lat, color }] }
 *               { type: 'focus', lon, lat, zoom? }
 *   page → app: { type: 'ready' } · { type: 'select', id }
 */
import type { GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { THEMES, type ThemeName } from '@winou/config';
import { useBaseMap } from '@/lib/map-style';

interface VehicleMsg {
  id: string;
  label: string;
  color: string;
  lon: number;
  lat: number;
  selected?: boolean;
}
type InMsg =
  | { type: 'vehicles'; vehicles: VehicleMsg[]; fit?: boolean }
  | { type: 'route'; paths: [number, number][][]; points: { lon: number; lat: number; color: string }[] }
  | { type: 'focus'; lon: number; lat: number; zoom?: number };

function post(msg: object) {
  const w = window as unknown as { ReactNativeWebView?: { postMessage(s: string): void } };
  const s = JSON.stringify(msg);
  if (w.ReactNativeWebView) w.ReactNativeWebView.postMessage(s);
  else window.parent?.postMessage(s, '*');
}

export default function EmbedMapPage() {
  return (
    <Suspense>
      <EmbedMap />
    </Suspense>
  );
}

function EmbedMap() {
  const params = useSearchParams();
  const locale = params.get('lang') ?? 'fr';
  // The app passes its own light/dark setting (it is not this page's saved choice).
  const theme: ThemeName = params.get('theme') === 'dark' ? 'dark' : 'light';
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready } = useBaseMap(container, locale, { theme });
  const markers = useRef(new Map<string, Marker>());
  const extra = useRef<Marker[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = theme;
  }, [locale, theme]);

  useEffect(() => {
    if (!map || !ml || !ready) return;
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': THEMES[theme].map.casing, 'line-width': 8 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': THEMES[theme].map.route, 'line-width': 4.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });

    const onMessage = (ev: MessageEvent | { data: string }) => {
      let msg: InMsg;
      try {
        msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'vehicles') {
        const seen = new Set<string>();
        for (const v of msg.vehicles) {
          seen.add(v.id);
          let mk = markers.current.get(v.id);
          if (!mk) {
            const el = document.createElement('button');
            el.type = 'button';
            el.addEventListener('click', () => post({ type: 'select', id: v.id }));
            mk = new ml.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(map);
            markers.current.set(v.id, mk);
          }
          mk.setLngLat([v.lon, v.lat]);
          const el = mk.getElement() as HTMLButtonElement;
          el.textContent = v.label;
          el.setAttribute('aria-label', v.label);
          // Set properties one by one: replacing the whole style would wipe MapLibre's positioning transform.
          Object.assign(el.style, {
            background: v.color,
            color: '#fff',
            border: '2px solid #fff',
            borderRadius: '999px',
            padding: '4px 12px',
            font: '700 14px system-ui, sans-serif',
            boxShadow: '0 2px 6px rgba(0,0,0,.25)',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            outline: v.selected ? '3px solid #0E2A47' : 'none',
            zIndex: v.selected ? '10' : '1',
          });
        }
        for (const [id, mk] of markers.current) if (!seen.has(id)) (mk.remove(), markers.current.delete(id));
        if ((msg.fit || !fitted.current) && msg.vehicles.length) {
          const b = new ml.LngLatBounds([msg.vehicles[0]!.lon, msg.vehicles[0]!.lat], [msg.vehicles[0]!.lon, msg.vehicles[0]!.lat]);
          msg.vehicles.forEach((v) => b.extend([v.lon, v.lat]));
          map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
          fitted.current = true;
        }
      } else if (msg.type === 'route') {
        (map.getSource('route') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: msg.paths.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p } })),
        });
        extra.current.forEach((m) => m.remove());
        extra.current = msg.points.map((p) => {
          const el = document.createElement('div');
          Object.assign(el.style, { width: '16px', height: '16px', borderRadius: '50%', background: p.color, border: '3px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.3)' });
          return new ml.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
        });
        const coords = msg.paths.flat();
        if (coords.length) {
          const b = new ml.LngLatBounds(coords[0], coords[0]);
          coords.forEach((c) => b.extend(c));
          map.fitBounds(b, { padding: 40, maxZoom: 15, duration: 0 });
        }
      } else if (msg.type === 'focus') {
        map.easeTo({ center: [msg.lon, msg.lat], zoom: Math.max(map.getZoom(), msg.zoom ?? 14), offset: [0, -100], duration: 500 });
      }
    };
    window.addEventListener('message', onMessage as EventListener);
    document.addEventListener('message', onMessage as unknown as EventListener); // Android WebView
    post({ type: 'ready' });
    return () => {
      window.removeEventListener('message', onMessage as EventListener);
      document.removeEventListener('message', onMessage as unknown as EventListener);
    };
  }, [map, ml, ready]);

  return <div ref={container} style={{ position: 'fixed', inset: 0 }} />;
}
