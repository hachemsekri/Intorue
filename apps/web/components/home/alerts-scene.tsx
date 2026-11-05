'use client';

import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { exampleVehicle, type ExampleVehicle } from './city';
import { useLazyMap } from './lazy-map';
import { drivenPart, headingAt, pointAt, type AlertType, type TripKey } from './routes';
import { clamp, prefersReducedMotion, useScrollFrame } from './scroll';
import { vehicleGeoJSON } from './vehicle-models';

export interface AlertsTexts {
  title: string;
  list: string[][];
  phone: string;
  updated: string;
  alertTypes: Record<AlertType, string>;
  vehicles: { moto: string; trot: string };
}

/** Which simulated vehicle each alert line shows on the phone, and where along its route. */
const EXAMPLES: { type: AlertType; who: ExampleVehicle; route: TripKey; at: number }[] = [
  { type: 'speeding', who: 'car', route: 'car', at: 0.3 },
  { type: 'geofence_exit', who: 'moto', route: 'moto', at: 0.92 },
  { type: 'movement_schedule', who: 'moto', route: 'moto', at: 0.15 },
  { type: 'device_offline', who: 'kia', route: 'car', at: 0.72 },
  { type: 'low_battery', who: 'trot', route: 'trot', at: 0.9 },
];

/**
 * Pinned scene: each alert line lights up in turn while the phone mock-up shows that alert on a
 * real map (created only when the scene is reached). Without script, every line is shown.
 */
export function AlertsScene({ t, locale, wordmark }: { t: AlertsTexts; locale: string; wordmark: readonly [string, string] }) {
  const [live, setLive] = useState(false);
  const [index, setIndex] = useState(0);
  const ex = EXAMPLES[index]!;
  const who = exampleVehicle(ex.who, locale, t.vehicles);
  const section = useRef<HTMLElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);
  const { map, routes, status, version } = useLazyMap(section, mapBox, {
    locale,
    satellite: false,
    camera: { center: [10.2, 36.83], zoom: 15.4, pitch: 50, bearing: 0 },
  });

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    setLive(true);
  }, []);

  const place = (q: number) => {
    const m = map.current;
    const g = routes.current?.[ex.route];
    if (!m || !g || status !== 'ready') return;
    const o = pointAt(g, q);
    const h = headingAt(g, q);
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(drivenPart(g, q));
    m.jumpTo({ center: o.pt, bearing: reduced.current ? 0 : h, zoom: 16.7, pitch: reduced.current ? 35 : 50 });
    const veh = vehicleGeoJSON(ex.route, o.pt, h, m.getZoom());
    (m.getSource('veh') as GeoJSONSource | undefined)?.setData(veh.veh);
    (m.getSource('vehshadow') as GeoJSONSource | undefined)?.setData(veh.shadow);
  };

  useScrollFrame(() => {
    const el = section.current;
    if (!el || !live) return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return; // off screen: no map updates
    const span = r.height - window.innerHeight;
    const raw = span > 0 ? clamp(-r.top / span, 0, 0.999) : 0;
    const f = raw * EXAMPLES.length;
    const i = Math.floor(f);
    if (i !== index) {
      setIndex(i);
      return;
    }
    place(clamp(ex.at - 0.1 + (f - i) * 0.1, 0, 1));
  });
  useEffect(() => {
    place(clamp(ex.at - 0.05, 0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, live, version, status]);

  return (
    <section ref={section} className={`alerts${live ? ' is-live' : ''}`} id="alertes" aria-labelledby="alertes-h">
      <div className="a-stage wrap">
        <div>
          <h2 id="alertes-h">{t.title}</h2>
          <ul className="alist">
            {t.list.map(([title, desc], n) => (
              <li key={n} className={n === index ? 'on' : undefined}>
                <strong>{title}</strong>
                <span>
                  <u>{desc}</u>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="phone" role="img" aria-label={t.phone}>
          <div className={`screen map-${status}`}>
            <div className="map" ref={mapBox} aria-hidden="true" />
            <div className="pbar wm" aria-hidden="true">
              {wordmark[0]}
              <span>{wordmark[1]}</span>
            </div>
            <div className="ppush" key={index} aria-hidden="true">
              {t.alertTypes[ex.type]}
              <small>
                <bdi>{who.name}</bdi> · <bdi dir="ltr">{who.plate}</bdi>
              </small>
            </div>
            <div className="pcard" aria-hidden="true">
              <strong>{who.name}</strong>
              <small>{t.updated}</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
