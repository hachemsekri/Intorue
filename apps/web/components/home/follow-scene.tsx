'use client';

import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { SATELLITE_SOURCE } from '@/lib/map-credits';
import { exampleVehicle } from './city';
import { useLazyMap } from './lazy-map';
import { angleGap, drivenPart, headingAt, legAt, PLACES, pointAt, TRIPS, turn, type AlertType, type TripKey, type TripLeg } from './routes';
import { clamp, prefersReducedMotion, useScrollFrame } from './scroll';
import { vehicleGeoJSON } from './vehicle-models';

export interface FollowTexts {
  title: string;
  choose: string;
  vehicles: Record<TripKey, string>;
  note: string;
  views: { choose: string; plan: string; satellite: string };
  mapUnavailable: string;
  events: Record<'departFrom' | 'speeding' | 'stopAt' | 'night' | 'zoneExit' | 'batteryLow', string>;
  alertTypes: Record<AlertType, string>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

/** Street name in the page's language (French streets keep their French name in English). */
export const streetOf = (leg: Pick<TripLeg, 'fr' | 'ar'>, locale: string) => (locale === 'ar' ? leg.ar : leg.fr);

export function legLabel(leg: TripLeg, t: Pick<FollowTexts, 'events'>, locale: string) {
  const street = streetOf(leg, locale);
  const p = leg.event.place ? PLACES[leg.event.place] : null;
  const place = p ? (locale === 'ar' ? p.ar : p.fr) : street;
  switch (leg.event.kind) {
    case 'street':
      return street;
    case 'speeding':
      return fill(t.events.speeding, { speed: leg.v });
    case 'zoneExit':
      return t.events.zoneExit;
    default:
      return fill(t.events[leg.event.kind], { place, speed: leg.v });
  }
}

/** Sets a street plaque (Arabic above, French below, as on Tunis' enamel signs) and flips it in. */
export function setPlaque(el: HTMLElement | null, leg: Pick<TripLeg, 'fr' | 'ar'>, reduced: boolean) {
  if (!el || el.dataset.k === leg.fr) return;
  el.dataset.k = leg.fr;
  el.querySelector('b')!.textContent = leg.ar;
  el.querySelector('em')!.textContent = leg.fr;
  if (!reduced) {
    el.classList.remove('flip');
    void el.offsetWidth;
    el.classList.add('flip');
  }
}

const VEHICLES: TripKey[] = ['car', 'moto', 'trot'];

/**
 * Pinned scene on the real map: scrolling drives the chosen vehicle along its route while the
 * camera follows it, and the street plaque, speed, timeline and alert update. The map is only
 * created when the scene is reached; the text side works without it.
 */
export function FollowScene({ t, locale }: { t: FollowTexts; locale: string }) {
  const [vehicle, setVehicle] = useState<TripKey>('car');
  const [satellite, setSatellite] = useState(false);
  const [live, setLive] = useState(false);
  const trip = TRIPS[vehicle];
  const who = exampleVehicle(vehicle, locale, t.vehicles);

  const section = useRef<HTMLElement>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const plaque = useRef<HTMLDivElement>(null);
  const speedBox = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);
  const heading = useRef<number | null>(null);
  const settle = useRef(0);
  const reduced = useRef(false);

  const start = TRIPS.car.legs[0]!;
  const { map, routes, status, version } = useLazyMap(section, mapBox, {
    locale,
    satellite,
    camera: { center: [10.235, 36.8385], zoom: 15.2, pitch: 45, bearing: 0 },
  });

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    setLive(true);
    return () => cancelAnimationFrame(settle.current);
  }, []);

  const frame = () => {
    const el = section.current;
    if (!el || !live) return;
    const r = el.getBoundingClientRect();
    const onScreen = r.top < window.innerHeight && r.bottom > 0;
    if (!onScreen) return; // nothing to update off screen
    const span = r.height - window.innerHeight;
    const raw = span > 0 ? clamp(-r.top / span, 0, 1) : 1;
    const p = clamp(raw * 1.04, 0, 1);

    const i = legAt(trip, p);
    const leg = trip.legs[i]!;
    setPlaque(plaque.current, leg, reduced.current);
    const a0 = i ? trip.stops[i - 1]! : 0;
    const within = (p - a0) / Math.max(0.001, trip.stops[i]! - a0);
    const v = p <= 0.001 || p >= 0.999 ? 0 : Math.round(leg.v * (0.72 + 0.28 * Math.sin(clamp(within, 0, 1) * Math.PI)));
    if (speed.current) speed.current.textContent = String(v);
    speedBox.current?.classList.toggle('hot', !!leg.alert && v > 0);
    log.current?.querySelectorAll('li').forEach((li, n) => li.classList.toggle('on', n <= i));
    if (i !== shown.current) {
      shown.current = i;
      const box = pop.current;
      if (box) {
        if (leg.alert) {
          box.textContent = `${t.alertTypes[leg.alert]} · ${who.name}`;
          box.classList.add('show');
        } else box.classList.remove('show');
      }
    }

    const m = map.current;
    const g = routes.current?.[vehicle];
    if (!m || !g || status !== 'ready') return;
    const o = pointAt(g, p);
    const target = headingAt(g, p);
    heading.current = turn(heading.current, target, reduced.current ? 1 : 0.35);
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(drivenPart(g, p));
    m.jumpTo({
      center: o.pt,
      bearing: reduced.current ? 0 : heading.current,
      pitch: reduced.current ? 35 : 44 + Math.sin(raw * Math.PI) * 8,
      zoom: (vehicle === 'trot' ? 17.2 : 16.6) + (reduced.current ? 0 : Math.sin(raw * Math.PI) * 0.4),
    });
    const veh = vehicleGeoJSON(vehicle, o.pt, heading.current, m.getZoom());
    (m.getSource('veh') as GeoJSONSource | undefined)?.setData(veh.veh);
    (m.getSource('vehshadow') as GeoJSONSource | undefined)?.setData(veh.shadow);
    // Keep turning smoothly after the scroll stops, until the vehicle points along the road.
    cancelAnimationFrame(settle.current);
    if (angleGap(heading.current, target) > 0.5) settle.current = requestAnimationFrame(frame);
  };
  useScrollFrame(frame);

  // Redraw at once when the vehicle changes, the scene goes live, or a map style finishes loading.
  useEffect(() => {
    shown.current = -1;
    heading.current = null;
    if (plaque.current) delete plaque.current.dataset.k;
    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, live, version, status]);

  return (
    <section ref={section} className={`scene${live ? ' is-live' : ''}`} id="suivi" aria-labelledby="suivi-h">
      <div className="stage">
        <div className="scene-side">
          <h2 id="suivi-h">{t.title}</h2>
          <div className="tabs" role="group" aria-label={t.choose}>
            {VEHICLES.map((v) => (
              <button key={v} type="button" aria-pressed={vehicle === v} onClick={() => setVehicle(v)}>
                {t.vehicles[v]}
              </button>
            ))}
          </div>
          <div className="row-m">
            <div className="plaque scene-plaque" ref={plaque} data-k={start.fr} aria-hidden="true">
              <b>{start.ar}</b>
              <em>{start.fr}</em>
            </div>
            <div className="speed" ref={speedBox} aria-hidden="true">
              <span ref={speed}>0</span>
              <small>km/h</small>
            </div>
          </div>
          <ol className="log" ref={log} aria-label={`${who.name} · ${t.note}`}>
            {trip.legs.map((l, n) => (
              <li key={`${vehicle}-${n}`} className={`${l.alert ? 'alert' : ''}${n === 0 ? ' on' : ''}`}>
                <time>{l.t}</time>
                <span>{legLabel(l, t, locale)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className={`scene-map map-${status}`}>
          <div className="map" ref={mapBox} aria-hidden="true" />
          {status === 'failed' && (
            <p className="map-off" role="note">
              {t.mapUnavailable}
            </p>
          )}
          {SATELLITE_SOURCE && (
            <div className="tabs view-switch" role="group" aria-label={t.views.choose}>
              <button type="button" aria-pressed={!satellite} onClick={() => setSatellite(false)}>
                {t.views.plan}
              </button>
              <button type="button" aria-pressed={satellite} onClick={() => setSatellite(true)}>
                {t.views.satellite}
              </button>
            </div>
          )}
          <div className="alert-pop" ref={pop} aria-hidden="true" />
          <span className="scroll-note">
            <bdi>{who.name}</bdi> · <bdi dir="ltr">{who.plate}</bdi> · {t.note}
          </span>
        </div>
      </div>
    </section>
  );
}
