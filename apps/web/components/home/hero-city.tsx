'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CITY_BOX, legAt, pointAt, ROUTES, routeGeometry, STREETS, type StreetKey } from './city';
import { clamp, prefersReducedMotion, useScrollFrame } from './scroll';

/** The cached city drawing plus a route trace and a vehicle dot drawn over it. */
export function CityImage({ src }: { src: string }) {
  return <image href={src} x={CITY_BOX.x} y={CITY_BOX.y} width={CITY_BOX.width} height={CITY_BOX.height} preserveAspectRatio="none" />;
}

export function Vehicle({ dotRef, at }: { dotRef: React.Ref<SVGGElement>; at: [number, number] }) {
  return (
    <g ref={dotRef} transform={`translate(${at[0]} ${at[1]})`}>
      <circle className="halo" r={26} />
      <circle r={13} fill="#FFFFFF" stroke="#3FE0D0" strokeWidth={5} />
    </g>
  );
}

/** Sets a street plaque (Arabic above, French below, as on Tunis' enamel signs) and flips it in. */
export function setPlaque(el: HTMLElement | null, key: StreetKey, reduced: boolean) {
  if (!el || el.dataset.k === key) return;
  el.dataset.k = key;
  const st = STREETS[key];
  el.querySelector('b')!.textContent = st.ar;
  el.querySelector('em')!.textContent = st.fr;
  if (!reduced) {
    el.classList.remove('flip');
    void el.offsetWidth;
    el.classList.add('flip');
  }
}

const REST = 'rotateX(40deg) scale(1.16)';
const LOOP_MS = 24000;

/**
 * Hero: the night city in 3D. The camera tilts in on load (CSS), a car drives its route in a loop
 * (paused off screen), two other vehicles pass by, and the tilt deepens as the page scrolls.
 */
export function HeroCity() {
  const tilt = useRef<HTMLDivElement>(null);
  const trace = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);
  const others = useRef<(SVGCircleElement | null)[]>([]);
  const plaque = useRef<HTMLDivElement>(null);
  const car = useMemo(() => routeGeometry(ROUTES.car), []);
  const extra = useMemo(() => [ROUTES.moto, ROUTES.trot].map((r, i) => ({ g: routeGeometry(r), off: i * 0.4 + 0.2 })), []);
  const reduced = useRef(false);
  const first = pointAt(car, car.total * 0.55);
  const firstStreet = ROUTES.car.legs[legAt(car, 0.55)]!.street;

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const frame = (p: number) => {
      const len = car.total * p;
      trace.current?.style.setProperty('stroke-dashoffset', String(car.total - len));
      const [x, y] = pointAt(car, len);
      dot.current?.setAttribute('transform', `translate(${x} ${y})`);
      setPlaque(plaque.current, ROUTES.car.legs[legAt(car, p)]!.street, reduced.current);
      extra.forEach((o, i) => {
        const [ox, oy] = pointAt(o.g, o.g.total * ((p + o.off) % 1));
        const c = others.current[i];
        c?.setAttribute('cx', String(ox));
        c?.setAttribute('cy', String(oy));
      });
    };
    if (reduced.current) {
      frame(0.55);
      return;
    }
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const loop = (t: number) => {
      frame(((t - t0) / LOOP_MS) % 1);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    if (tilt.current) io.observe(tilt.current);
    raf = requestAnimationFrame(loop);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [car, extra]);

  useScrollFrame(() => {
    if (reduced.current || !tilt.current) return;
    const hy = clamp(window.scrollY / window.innerHeight, 0, 1);
    tilt.current.style.transform = hy > 0 ? `rotateX(${40 + hy * 18}deg) scale(${1.16 + hy * 0.3})` : REST;
  });

  return (
    <>
      <div className="tilt" ref={tilt} aria-hidden="true">
        <svg className="city" viewBox="130 110 900 600" preserveAspectRatio="xMidYMid slice">
          <CityImage src="/illustrations/city-hero.svg" />
          <path
            ref={trace}
            className="trace"
            d={car.d}
            style={{ strokeDasharray: car.total, strokeDashoffset: car.total * 0.45 }}
          />
          <g className="others">
            {extra.map((o, i) => {
              const [x, y] = pointAt(o.g, o.g.total * ((0.55 + o.off) % 1));
              return (
                <circle
                  key={i}
                  ref={(el) => {
                    others.current[i] = el;
                  }}
                  r={9}
                  cx={x}
                  cy={y}
                  fill="#FFFFFF"
                  fillOpacity={0.9}
                />
              );
            })}
          </g>
          <Vehicle dotRef={dot} at={first} />
        </svg>
      </div>
      <div className="plaque hero-plaque enter" style={{ '--i': 3 } as React.CSSProperties} ref={plaque} data-k={firstStreet} aria-hidden="true">
        <b>{STREETS[firstStreet].ar}</b>
        <em>{STREETS[firstStreet].fr}</em>
      </div>
    </>
  );
}
