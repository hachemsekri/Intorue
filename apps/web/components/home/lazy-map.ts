'use client';

import type { Map as MlMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { nightStyle, windowImage } from './night-style';
import { loadRoutes, type Line, type LngLat, type TripKey } from './routes';

export type MapStatus = 'idle' | 'loading' | 'ready' | 'failed';
export interface Camera {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
}

let basemap: Promise<{ maxZoom?: number }> | null = null;
const loadBasemap = () =>
  (basemap ??= fetch('/map/basemap.json')
    .then((r) => (r.ok ? (r.json() as Promise<{ maxZoom?: number }>) : Promise.reject(new Error('basemap missing'))))
    .catch((e) => {
      basemap = null;
      throw e;
    }));

/**
 * A real map that exists only while its section is on screen or close to it:
 *  - nothing (no MapLibre code, tiles, fonts or route data) is loaded until the section is reached;
 *  - the map is removed again once the section is more than a screen away, to free memory;
 *  - pixel ratio and tile cache are capped for phones.
 * `version` changes each time a style finishes loading, so callers can redraw their layers.
 */
export function useLazyMap(
  section: RefObject<HTMLElement | null>,
  container: RefObject<HTMLDivElement | null>,
  opts: { locale: string; satellite: boolean; camera: Camera },
) {
  const [wanted, setWanted] = useState(false);
  const [status, setStatus] = useState<MapStatus>('idle');
  const [version, setVersion] = useState(0);
  const map = useRef<MlMap | null>(null);
  const routes = useRef<Record<TripKey, Line> | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Reached (actually on screen, not just next to it) → create. Far away → remove.
  useEffect(() => {
    const el = section.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const near = new IntersectionObserver(([e]) => e?.isIntersecting && setWanted(true), { rootMargin: '-2px 0px' });
    const far = new IntersectionObserver(([e]) => e && !e.isIntersecting && setWanted(false), { rootMargin: '100% 0px' });
    near.observe(el);
    far.observe(el);
    return () => {
      near.disconnect();
      far.disconnect();
    };
  }, [section]);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    setStatus('loading');
    void Promise.all([import('maplibre-gl'), loadRoutes(), loadBasemap()])
      .then(([ml, r, meta]) => {
        const el = container.current;
        if (cancelled || !el) return;
        routes.current = r;
        if (ml.getRTLTextPluginStatus() === 'unavailable') void ml.setRTLTextPlugin('/vendor/mapbox-gl-rtl-text.js', true).catch(() => {});
        const o = optsRef.current;
        const m = new ml.Map({
          container: el,
          style: nightStyle({ origin: window.location.origin, maxZoom: Number(meta.maxZoom ?? 15), locale: o.locale, satellite: o.satellite }),
          interactive: false,
          attributionControl: false,
          maxPitch: 75,
          fadeDuration: 0,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
          maxTileCacheSize: 40,
          ...o.camera,
        });
        m.on('styleimagemissing', (e: { id: string }) => {
          if (e.id !== 'win' || m.hasImage('win')) return;
          const img = windowImage();
          if (img) m.addImage('win', img);
        });
        // Outside the downloaded area, deeper tiles don't exist: those 404s are expected.
        m.on('error', (e) => {
          const msg = String((e as { error?: Error }).error?.message ?? '');
          if (!msg.includes('/map/tiles/')) console.warn('[home map]', msg || e);
        });
        m.on('style.load', () => {
          setStatus('ready');
          setVersion((v) => v + 1);
        });
        ro = new ResizeObserver(() => m.resize());
        ro.observe(el);
        map.current = m;
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
      setStatus('idle');
    };
  }, [wanted, container]);

  // Plan / Satellite: swap the style in place.
  const firstSat = useRef(opts.satellite);
  useEffect(() => {
    if (firstSat.current === opts.satellite) return;
    firstSat.current = opts.satellite;
    const m = map.current;
    if (!m) return;
    m.setStyle(nightStyle({ origin: window.location.origin, maxZoom: 15, locale: optsRef.current.locale, satellite: opts.satellite }), { diff: false });
  }, [opts.satellite]);

  return { map, routes, status, version };
}
