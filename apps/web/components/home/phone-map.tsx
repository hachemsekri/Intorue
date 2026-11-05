'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useBaseMap } from '@/lib/map-style';

const VEHICLES: { label: string; color: string; lngLat: [number, number] }[] = [
  { label: 'Yamaha', color: '#0E8A87', lngLat: [10.1795, 36.8105] },
  { label: 'Clio', color: '#C2540A', lngLat: [10.2005, 36.8052] },
  { label: 'TR-014', color: '#3F6EA8', lngLat: [10.225, 36.797] },
];

function Inner({ locale }: { locale: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready } = useBaseMap(container, locale, { center: [10.2, 36.805], zoom: 12.6, controls: false, compactAttribution: true });
  useEffect(() => {
    if (!map || !ml || !ready) return;
    map.scrollZoom.disable();
    map.dragPan.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.disable();
    const added = VEHICLES.map((v) => {
      const el = document.createElement('div');
      el.textContent = v.label;
      Object.assign(el.style, {
        background: v.color,
        color: '#fff',
        border: '2px solid #fff',
        borderRadius: '999px',
        padding: '3px 10px',
        font: '700 12px var(--font-latin), system-ui, sans-serif',
        whiteSpace: 'nowrap',
      });
      return new ml.Marker({ element: el }).setLngLat(v.lngLat).addTo(map);
    });
    return () => added.forEach((m) => m.remove());
  }, [map, ml, ready]);
  return <div ref={container} className="h-full w-full" aria-hidden />;
}

/** The map inside the phone: created only when it scrolls into view, to keep the page light. */
export function PhoneMap({ locale }: { locale: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: '200px' });
    if (host.current) io.observe(host.current);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={host} className="h-full w-full bg-[#EEF2F6]">
      {visible && <Inner locale={locale} />}
    </div>
  );
}
