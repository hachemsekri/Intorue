'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ALERT_EXAMPLES, exampleVehicle, pointAt, ROUTES, routeGeometry, type AlertType } from './city';
import { CityImage, Vehicle } from './hero-city';
import { clamp, useScrollFrame } from './scroll';

export interface AlertsTexts {
  title: string;
  list: string[][];
  phone: string;
  updated: string;
  alertTypes: Record<AlertType, string>;
  vehicles: { moto: string; trot: string };
}

/**
 * Pinned scene: each alert line lights up in turn while the phone mock-up shows that alert
 * on an illustrated map. Without script, every line and its explanation is shown.
 */
export function AlertsScene({ t, locale, wordmark }: { t: AlertsTexts; locale: string; wordmark: readonly [string, string] }) {
  const [live, setLive] = useState(false);
  const [index, setIndex] = useState(0);
  const ex = ALERT_EXAMPLES[index]!;
  const g = useMemo(() => routeGeometry(ROUTES[ex.route]), [ex.route]);
  const who = exampleVehicle(ex.who, locale, t.vehicles);

  const section = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);

  useEffect(() => setLive(true), []);

  const place = (p: number) => {
    const l = g.total * p;
    trace.current?.style.setProperty('stroke-dashoffset', String(g.total - l));
    const [x, y] = pointAt(g, l);
    dot.current?.setAttribute('transform', `translate(${x} ${y})`);
    svg.current?.setAttribute('viewBox', `${x - 190} ${y - 260} 380 520`);
  };

  useScrollFrame(() => {
    const el = section.current;
    if (!el || !live) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < -50 || r.top > window.innerHeight + 50) return;
    const span = r.height - window.innerHeight;
    const raw = span > 0 ? clamp(-r.top / span, 0, 0.999) : 0;
    const f = raw * ALERT_EXAMPLES.length;
    const i = Math.floor(f);
    if (i !== index) {
      setIndex(i);
      return; // geometry for the new example is ready on the next frame
    }
    place(clamp(ex.at - 0.14 + (f - i) * 0.14, 0, 1));
  });
  // After switching examples, place the phone map at once.
  useEffect(() => {
    if (live) place(clamp(ex.at - 0.07, 0, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, live]);

  const start = pointAt(g, g.total * ex.at);

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
          <div className="screen">
            <svg ref={svg} className="city" viewBox={`${start[0] - 190} ${start[1] - 260} 380 520`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <CityImage src="/illustrations/city-phone.svg" />
              <path ref={trace} className="trace" d={g.d} style={{ strokeDasharray: g.total, strokeDashoffset: g.total * (1 - ex.at) }} />
              <Vehicle dotRef={dot} at={start} />
            </svg>
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
