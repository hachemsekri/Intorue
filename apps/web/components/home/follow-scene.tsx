'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exampleVehicle,
  legAt,
  pointAt,
  ROUTES,
  routeGeometry,
  STREETS,
  streetName,
  type AlertType,
  type Leg,
  type VehicleKey,
} from './city';
import { CityImage, setPlaque, Vehicle } from './hero-city';
import { clamp, prefersReducedMotion, useScrollFrame } from './scroll';

export interface FollowTexts {
  title: string;
  choose: string;
  vehicles: Record<VehicleKey, string>;
  example: string;
  note: string;
  events: Record<'departAgency' | 'speeding' | 'stop' | 'night' | 'zoneExit' | 'departAt' | 'batteryLow', string>;
  alertTypes: Record<AlertType, string>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

function legLabel(leg: Leg, t: FollowTexts, locale: string) {
  const street = streetName(leg.street, locale);
  if (leg.event === 'street') return street;
  return fill(t.events[leg.event], { street, speed: leg.speed });
}

const VEHICLES: VehicleKey[] = ['car', 'moto', 'trot'];

/**
 * Pinned scene: scrolling drives the chosen vehicle along its route; the camera follows it while
 * the street plaque, speed, timeline and alert update. Without script it is a still of the route.
 */
export function FollowScene({ t, locale }: { t: FollowTexts; locale: string }) {
  const [vehicle, setVehicle] = useState<VehicleKey>('car');
  const [live, setLive] = useState(false);
  const route = ROUTES[vehicle];
  const g = useMemo(() => routeGeometry(route), [route]);
  const who = exampleVehicle(vehicle, locale, t.vehicles);

  const section = useRef<HTMLElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);
  const plaque = useRef<HTMLDivElement>(null);
  const speedBox = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const log = useRef<HTMLOListElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const shown = useRef(-1);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    setLive(true);
  }, []);

  const frame = () => {
    const el = section.current;
    if (!el || !live) return;
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    if (r.bottom < -50 || r.top > window.innerHeight + 50) return; // off screen: nothing to draw
    const raw = span > 0 ? clamp(-r.top / span, 0, 1) : 1;
    const p = clamp(raw * 1.06, 0, 1);
    const len = g.total * p;
    trace.current?.style.setProperty('stroke-dashoffset', String(g.total - len));
    const [x, y] = pointAt(g, len);
    dot.current?.setAttribute('transform', `translate(${x} ${y})`);
    // The viewBox follows the vehicle, in a frame with the camera's shape.
    const c = cam.current;
    const vw = reduced.current ? 1100 : 760 - Math.sin(raw * Math.PI) * 170;
    const vh = vw * ((c?.offsetHeight || 1) / Math.max(1, c?.offsetWidth || 1));
    svg.current?.setAttribute('viewBox', `${x - vw / 2} ${y - vh * 0.52} ${vw} ${vh}`);
    if (!reduced.current && c) c.style.transform = `rotateX(${16 + raw * 26}deg) rotateZ(${-5 + raw * 10}deg) scale(1.08)`;

    const i = legAt(g, p);
    const leg = route.legs[i]!;
    setPlaque(plaque.current, leg.street, reduced.current);
    const a0 = i ? g.stops[i - 1]! : 0;
    const within = (p - a0) / Math.max(0.001, g.stops[i]! - a0);
    const v = p <= 0.001 || p >= 0.999 ? 0 : Math.round(leg.speed * (0.72 + 0.28 * Math.sin(clamp(within, 0, 1) * Math.PI)));
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
  };
  useScrollFrame(frame);
  // Redraw at once when the vehicle changes or the scene goes live.
  useEffect(() => {
    shown.current = -1;
    if (plaque.current) delete plaque.current.dataset.k;
    frame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, live]);

  const start = route.legs[0]!.street;
  const end = pointAt(g, g.total);

  return (
    <section ref={section} className={`scene${live ? ' is-live' : ''}`} id="suivi" aria-labelledby="suivi-h">
      <div className="stage">
        <div className="scene-side">
          <h2 id="suivi-h" data-reveal="0">
            {t.title}
          </h2>
          <div className="tabs" role="group" aria-label={t.choose}>
            {VEHICLES.map((v) => (
              <button key={v} type="button" aria-pressed={vehicle === v} onClick={() => setVehicle(v)}>
                {t.vehicles[v]}
              </button>
            ))}
          </div>
          <div className="row-m">
            <div className="plaque scene-plaque" ref={plaque} data-k={start} aria-hidden="true">
              <b>{STREETS[start].ar}</b>
              <em>{STREETS[start].fr}</em>
            </div>
            <div className="speed" ref={speedBox} aria-hidden="true">
              <span ref={speed}>0</span>
              <small>km/h</small>
            </div>
          </div>
          <ol className="log" ref={log} aria-label={`${who.name} · ${t.example}`}>
            {route.legs.map((l, n) => (
              <li key={`${vehicle}-${n}`} className={`${l.alert ? 'alert' : ''}${n === 0 ? ' on' : ''}`}>
                <time>{l.time}</time>
                <span>{legLabel(l, t, locale)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="scene-map" aria-hidden="true">
          <div className="cam" ref={cam}>
            <svg ref={svg} className="city" viewBox="130 110 900 600" preserveAspectRatio="xMidYMid slice">
              <CityImage src="/illustrations/city-follow.svg" />
              <path
                ref={trace}
                className="trace"
                d={g.d}
                style={{ strokeDasharray: g.total, strokeDashoffset: live ? g.total : 0 }}
              />
              <Vehicle dotRef={dot} at={live ? pointAt(g, 0) : end} />
            </svg>
          </div>
          <div className="alert-pop" ref={pop} />
          <span className="scroll-note">
            <bdi>{who.name}</bdi> · <bdi dir="ltr">{who.plate}</bdi> · {t.note}
          </span>
        </div>
      </div>
    </section>
  );
}
