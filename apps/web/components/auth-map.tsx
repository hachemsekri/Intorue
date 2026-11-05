'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { TUNIS, useBaseMap } from '@/lib/map-style';

/** Sign-in pages: a still view of central Tunis on the real map, in the current theme. */
export function AuthMap() {
  const { locale } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  useBaseMap(container, locale, { center: TUNIS, zoom: 14.2, controls: false, interactive: false });
  // MapLibre sets position: relative on its container, so the sizing lives on a wrapper.
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
