'use client';

import { interpolate, messages, type SupportedLocale } from '@winou/i18n';
import type { GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useBaseMap } from '@/lib/map-style';

type Kind = 'speeding' | 'zone' | 'night' | 'offline';

interface Scenario {
  kind: Kind;
  label: string;
  type: 'speeding' | 'geofence_exit' | 'movement_schedule' | 'device_offline';
  severity: 'urgent' | 'warning';
  vehicle: string;
  plate: string;
  path: [number, number][];
  /** km/h at each point of the path */
  speeds: number[];
  /** fraction of the drive when the alert goes off */
  alertAt: number;
  vars: Record<string, string | number>;
  zone?: { center: [number, number]; radiusM: number };
  clock?: string;
}

/** Simulated situations on real roads around Tunis (same scenarios as the product's simulator). */
const SCENARIOS: Scenario[] = [
  {
    kind: 'speeding',
    label: 'i20',
    type: 'speeding',
    severity: 'warning',
    vehicle: 'Hyundai i20',
    plate: '231 TUN 1590',
    path: [[10.2281, 36.7532], [10.26, 36.742], [10.2905, 36.7302], [10.335, 36.711], [10.3802, 36.6905], [10.44, 36.645]],
    speeds: [62, 88, 104, 118, 128, 126],
    alertAt: 0.72,
    vars: { speed: 128, limit: 110 },
  },
  {
    kind: 'zone',
    label: 'TR-014',
    type: 'geofence_exit',
    severity: 'warning',
    vehicle: 'Trottinette 014',
    plate: 'TR-014',
    path: [[10.3452, 36.8702], [10.3412, 36.8696], [10.336, 36.873], [10.33, 36.876], [10.3244, 36.8784], [10.3297, 36.8858]],
    speeds: [14, 17, 19, 20, 18, 16],
    alertAt: 0.5,
    vars: {},
    zone: { center: [10.3435, 36.8705], radiusM: 900 },
  },
  {
    kind: 'night',
    label: 'Picanto',
    type: 'movement_schedule',
    severity: 'urgent',
    vehicle: 'Kia Picanto',
    plate: '220 TUN 9087',
    path: [[10.2336, 36.8322], [10.2295, 36.8352], [10.225, 36.838], [10.2095, 36.8395], [10.1951, 36.8452]],
    speeds: [0, 18, 34, 52, 46],
    alertAt: 0.22,
    vars: { time: '02:14' },
    clock: '02:14',
  },
  {
    kind: 'offline',
    label: 'Yamaha',
    type: 'device_offline',
    severity: 'urgent',
    vehicle: 'Moto Yamaha',
    plate: '77 TUN 2106',
    path: [[10.1813, 36.8117], [10.1795, 36.8097], [10.1772, 36.8075], [10.1788, 36.8035], [10.1803, 36.7992]],
    speeds: [38, 44, 41, 36, 0],
    alertAt: 0.62,
    vars: {},
  },
];

const DURATION_MS = 9000;
const R = 6_371_000;
const dist = (a: [number, number], b: [number, number]) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Position, speed and travelled line at fraction t of the path (by distance). */
function along(s: Scenario, t: number) {
  const seg = s.path.slice(1).map((p, i) => dist(s.path[i]!, p));
  const total = seg.reduce((a, b) => a + b, 0);
  let left = t * total;
  const line: [number, number][] = [s.path[0]!];
  for (let i = 0; i < seg.length; i++) {
    const a = s.path[i]!;
    const b = s.path[i + 1]!;
    if (left <= seg[i]!) {
      const f = seg[i]! === 0 ? 0 : left / seg[i]!;
      const p: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      line.push(p);
      const speed = s.speeds[i]! + (s.speeds[i + 1]! - s.speeds[i]!) * f;
      return { pos: p, speed, line };
    }
    left -= seg[i]!;
    line.push(b);
  }
  return { pos: s.path[s.path.length - 1]!, speed: s.speeds[s.speeds.length - 1]!, line };
}

function circle(center: [number, number], radiusM: number): [number, number][] {
  const dLat = radiusM / 110_540;
  const dLon = radiusM / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [center[0] + dLon * Math.cos(a), center[1] + dLat * Math.sin(a)] as [number, number];
  });
}

/**
 * The home page's live thing: the product's real (self-hosted) map plays one of four
 * situations, and the alert card appears at the moment the platform would send it.
 */
export function DemoMap({ locale }: { locale: SupportedLocale }) {
  const m = messages[locale];
  const container = useRef<HTMLDivElement>(null);
  const { map, ml, ready } = useBaseMap(container, locale, { center: [10.25, 36.79], zoom: 10.5 });
  const [kind, setKind] = useState<Kind>('speeding');
  const [run, setRun] = useState(0);
  const [state, setState] = useState<{ speed: number; alerted: boolean; offline: boolean }>({ speed: 0, alerted: false, offline: false });
  const marker = useRef<Marker | null>(null);
  const scenario = SCENARIOS.find((s) => s.kind === kind)!;

  useEffect(() => {
    if (!map || !ml || !ready) return;
    if (!map.getSource('demo-route')) {
      const empty = { type: 'FeatureCollection' as const, features: [] };
      map.addSource('demo-zone', { type: 'geojson', data: empty });
      map.addSource('demo-route', { type: 'geojson', data: empty });
      map.addLayer({ id: 'demo-zone-fill', type: 'fill', source: 'demo-zone', paint: { 'fill-color': '#14B8A6', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'demo-zone-line', type: 'line', source: 'demo-zone', paint: { 'line-color': '#0E7C7B', 'line-width': 2.5 } });
      map.addLayer({ id: 'demo-route-casing', type: 'line', source: 'demo-route', paint: { 'line-color': '#fff', 'line-width': 9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'demo-route', type: 'line', source: 'demo-route', paint: { 'line-color': '#0E7C7B', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    }
    const s = scenario;
    (map.getSource('demo-zone') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: s.zone ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(s.zone.center, s.zone.radiusM)] } }] : [],
    });
    const b = new ml.LngLatBounds(s.path[0], s.path[0]);
    s.path.forEach((p) => b.extend(p));
    if (s.zone) circle(s.zone.center, s.zone.radiusM).forEach((p) => b.extend(p));
    const narrow = window.innerWidth < 640;
    map.fitBounds(b, { padding: narrow ? { top: 40, bottom: 150, left: 30, right: 30 } : { top: 80, bottom: 80, left: 80, right: 420 }, maxZoom: 15, duration: 0 });

    if (!marker.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      marker.current = new ml.Marker({ element: el, anchor: 'center' }).setLngLat(s.path[0]!).addTo(map);
    }
    const el = marker.current.getElement();
    el.textContent = s.label;
    Object.assign(el.style, {
      background: '#0E8A87',
      color: '#fff',
      border: '2px solid #fff',
      borderRadius: '999px',
      padding: '4px 12px',
      font: '700 14px var(--font-latin), system-ui, sans-serif',
      boxShadow: '0 2px 8px rgba(11,36,64,.3)',
      whiteSpace: 'nowrap',
      transition: 'background-color .3s',
    });

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / DURATION_MS);
      const offline = s.kind === 'offline' && t >= s.alertAt;
      // An unplugged tracker stops reporting: the marker freezes where it was last seen.
      const shown = offline ? along(s, s.alertAt) : along(s, t);
      marker.current!.setLngLat(shown.pos);
      el.style.background = offline ? '#6B7785' : shown.speed < 3 ? '#3F6EA8' : '#0E8A87';
      (map.getSource('demo-route') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: shown.line } }],
      });
      setState({ speed: Math.round(shown.speed), alerted: t >= s.alertAt, offline });
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [map, ml, ready, scenario, run]);

  const vars = { plate: scenario.plate, zone: m.home.demo.zoneName, since: '', pct: '', ...scenario.vars };
  const desc =
    scenario.type === 'device_offline' ? `${scenario.plate} · ${m.alerts.types.device_offline}` : interpolate(m.alerts.desc[scenario.type], vars);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[min(64vh,660px)] min-h-[440px] overflow-hidden bg-[#EEF2F6]">
        <div ref={container} className="h-full w-full" role="img" aria-label={`${m.home.demo.label} : ${m.home.demo.scenarios[kind]}`} />
        <noscript>
          <p className="absolute inset-0 grid place-items-center p-8 text-center text-lg">{m.home.demo.noScript}</p>
        </noscript>

        {/* Live readout, as in the product's vehicle card */}
        <div className="pointer-events-none absolute start-4 top-4 rounded-2xl bg-white px-4 py-3 text-navy sm:start-6 sm:top-6">
          <p className="text-[15px] font-bold">
            {scenario.vehicle} · <span className="tabular-nums">{scenario.plate}</span>
          </p>
          <p className="text-sm text-muted tabular-nums">
            {state.offline ? m.map.statuses.offline : `${state.speed} km/h`}
            {scenario.clock ? ` · ${scenario.clock}` : ''}
          </p>
        </div>

        {/* The alert, appearing when the platform would send it */}
        <div
          role="status"
          aria-live="polite"
          className={`absolute inset-x-4 bottom-4 rounded-2xl bg-white p-5 text-navy transition-[opacity,transform] duration-500 sm:inset-x-auto sm:end-6 sm:top-6 sm:bottom-auto sm:w-[380px] ${
            state.alerted ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0 sm:-translate-y-4'
          }`}
        >
          {state.alerted && (
            <>
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                  scenario.severity === 'urgent' ? 'bg-attention-bg text-attention' : 'bg-info-bg text-navy'
                }`}
              >
                {m.alerts.severities[scenario.severity]}
              </span>
              <p className="mt-3 text-lg font-bold">
                {m.alerts.types[scenario.type]} · {scenario.vehicle}
              </p>
              <p className="mt-0.5 text-muted">{desc}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={m.home.demo.choose}>
        {SCENARIOS.map((s) => (
          <button
            key={s.kind}
            type="button"
            aria-pressed={kind === s.kind}
            onClick={() => {
              setKind(s.kind);
              setRun((r) => r + 1);
            }}
            className={`min-h-11 rounded-full px-5 text-[15px] font-semibold transition-colors ${
              kind === s.kind ? 'bg-navy text-white' : 'bg-[#E4EAF0] text-navy hover:bg-[#D7DFE8]'
            }`}
          >
            {m.home.demo.scenarios[s.kind]}
          </button>
        ))}
        <button type="button" onClick={() => setRun((r) => r + 1)} className="min-h-11 rounded-full px-4 text-[15px] font-semibold text-teal-dark underline-offset-4 hover:underline">
          {m.home.demo.replay}
        </button>
        <p className="ms-auto text-sm text-muted">{m.home.demo.simulated}</p>
      </div>
    </div>
  );
}
