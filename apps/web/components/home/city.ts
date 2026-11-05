/**
 * The home page's night city: an ILLUSTRATION (not map data). Streets, routes and vehicles are
 * examples. Pure functions shared by the server (the cached SVG image) and the client (animation).
 */

export type StreetKey = 'bourguiba' | 'carthage' | 'paris' | 'marseille' | 'khaldoun' | 'yougo' | 'espagne';

/** Real street names of central Tunis, as on the bilingual enamel plaques. */
export const STREETS: Record<StreetKey, { fr: string; ar: string }> = {
  bourguiba: { fr: 'Avenue Habib Bourguiba', ar: 'شارع الحبيب بورقيبة' },
  carthage: { fr: 'Avenue de Carthage', ar: 'شارع قرطاج' },
  paris: { fr: 'Avenue de Paris', ar: 'شارع باريس' },
  marseille: { fr: 'Rue de Marseille', ar: 'نهج مرسيليا' },
  khaldoun: { fr: 'Rue Ibn Khaldoun', ar: 'نهج ابن خلدون' },
  yougo: { fr: 'Rue de Yougoslavie', ar: 'نهج يوغسلافيا' },
  espagne: { fr: 'Rue d’Espagne', ar: 'نهج إسبانيا' },
};

export type VehicleKey = 'car' | 'moto' | 'trot';
export type EventKind = 'departAgency' | 'street' | 'speeding' | 'stop' | 'night' | 'zoneExit' | 'departAt' | 'batteryLow';
export type AlertType = 'speeding' | 'movement_schedule' | 'geofence_exit' | 'low_battery' | 'device_offline';

export interface Leg {
  street: StreetKey;
  d: string;
  speed: number;
  time: string;
  event: EventKind;
  alert?: AlertType;
}
export interface Route {
  plate: string;
  legs: Leg[];
}

export const ROUTES: Record<VehicleKey, Route> = {
  car: {
    plate: '245 TUN 7812',
    legs: [
      { street: 'yougo', d: 'M70 590H620', speed: 44, time: '08:12', event: 'departAgency' },
      { street: 'carthage', d: 'M620 590V400', speed: 38, time: '08:19', event: 'street' },
      { street: 'bourguiba', d: 'M620 400H860', speed: 72, time: '08:24', event: 'speeding', alert: 'speeding' },
      { street: 'khaldoun', d: 'M860 400V235', speed: 31, time: '08:31', event: 'street' },
      { street: 'marseille', d: 'M860 235H560', speed: 24, time: '08:37', event: 'stop' },
    ],
  },
  moto: {
    plate: '77 TUN 2106',
    legs: [
      { street: 'paris', d: 'M560 40V235', speed: 36, time: '02:04', event: 'night', alert: 'movement_schedule' },
      { street: 'marseille', d: 'M560 235H860', speed: 41, time: '02:08', event: 'street' },
      { street: 'khaldoun', d: 'M860 235V590', speed: 52, time: '02:12', event: 'street' },
      { street: 'yougo', d: 'M860 590H1160', speed: 60, time: '02:16', event: 'zoneExit', alert: 'geofence_exit' },
    ],
  },
  trot: {
    plate: 'TR-014',
    legs: [
      { street: 'bourguiba', d: 'M60 400H304', speed: 18, time: '16:40', event: 'departAt' },
      { street: 'espagne', d: 'M304 400L316 590', speed: 15, time: '16:46', event: 'street' },
      { street: 'yougo', d: 'M316 590H620', speed: 20, time: '16:52', event: 'street' },
      { street: 'carthage', d: 'M620 590V790', speed: 12, time: '16:58', event: 'batteryLow', alert: 'low_battery' },
    ],
  },
};

/** Alerts section: which example each line shows on the phone, and where along its route. */
export type ExampleVehicle = VehicleKey | 'kia';
export const ALERT_EXAMPLES: { type: AlertType; who: ExampleVehicle; route: VehicleKey; at: number }[] = [
  { type: 'speeding', who: 'car', route: 'car', at: 0.72 },
  { type: 'geofence_exit', who: 'moto', route: 'moto', at: 0.92 },
  { type: 'movement_schedule', who: 'moto', route: 'moto', at: 0.2 },
  { type: 'device_offline', who: 'kia', route: 'car', at: 0.95 },
  { type: 'low_battery', who: 'trot', route: 'trot', at: 0.9 },
];

const PLATES: Record<ExampleVehicle, string> = { car: '245 TUN 7812', moto: '77 TUN 2106', trot: 'TR-014', kia: '220 TUN 9087' };

/** Example vehicle names (made-up fleet), localized where a word is involved. */
export function exampleVehicle(who: ExampleVehicle, locale: string, labels: { moto: string; trot: string }) {
  const name =
    who === 'car' ? 'Renault Clio' : who === 'kia' ? 'Kia Picanto' : who === 'moto' ? (locale === 'fr' ? 'Moto Yamaha' : 'Yamaha') : `${labels.trot} 014`;
  const plate = locale === 'ar' ? PLATES[who].replace('TUN', 'تونس') : PLATES[who];
  return { name, plate };
}

export const streetName = (k: StreetKey, locale: string) => (locale === 'ar' ? STREETS[k].ar : STREETS[k].fr);

// ---------- Geometry (routes are straight segments, so lengths are exact without the DOM) ----------

type Pt = [number, number];

function legPoints(d: string, from?: Pt): Pt[] {
  const tokens = d.match(/[MLHV]|-?\d+(?:\.\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let cur: Pt = from ?? [0, 0];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === 'M' || t === 'L') {
      cur = [Number(tokens[++i]), Number(tokens[++i])];
      pts.push(cur);
    } else if (t === 'H') {
      cur = [Number(tokens[++i]), cur[1]];
      pts.push(cur);
    } else if (t === 'V') {
      cur = [cur[0], Number(tokens[++i])];
      pts.push(cur);
    }
  }
  return pts;
}

export interface Geometry {
  d: string;
  points: Pt[];
  cum: number[];
  total: number;
  /** cumulative fraction at the end of each leg */
  stops: number[];
}

export function routeGeometry(route: Route): Geometry {
  const points: Pt[] = [];
  const legEnds: number[] = [];
  for (const leg of route.legs) {
    const pts = legPoints(leg.d, points[points.length - 1]);
    // Each leg starts where the previous one ended.
    points.push(...(points.length ? pts.slice(1) : pts));
    legEnds.push(points.length - 1);
  }
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
  return { d, points, cum, total, stops: legEnds.map((i) => cum[i]! / total) };
}

export function pointAt(g: Geometry, len: number): Pt {
  const l = Math.min(Math.max(len, 0), g.total);
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i]! < l) i++;
  const a = g.points[i - 1]!;
  const b = g.points[i]!;
  const seg = g.cum[i]! - g.cum[i - 1]!;
  const f = seg ? (l - g.cum[i - 1]!) / seg : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export const legAt = (g: Geometry, p: number) => {
  const i = g.stops.findIndex((x) => p <= x);
  return i < 0 ? g.stops.length - 1 : i;
};

// ---------- The city drawing (rendered once into a cached SVG file) ----------

const ROADS: [string, number][] = [
  ['M-300 400H1500', 46],
  ['M620 400V1100', 24],
  ['M560 -300V400', 24],
  ['M-300 235H960', 20],
  ['M860 -300V1100', 20],
  ['M-300 590H1500', 20],
  ['M270 -300L340 1100', 18],
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const n1 = (v: number) => Math.round(v * 10) / 10;
const rect = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`;

/**
 * Tunis at night: lake, park, streets, then blocks with lit windows. Blocks are merged into a
 * few paths per row (back to front), so the whole city is ~200 elements instead of thousands.
 * The drawing covers -500,-500 → 1800,1400.
 */
export function citySvg(seed: number, plain = false): string {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: string[] = [];
  out.push('<rect x="-500" y="-500" width="2300" height="1900" fill="#0A1729"/>');
  out.push('<path d="M1020 -500H1800V1400H1120C1070 900 1150 300 1020 -500Z" fill="#0E3350"/>');
  out.push('<path d="M-500 650H255L300 1400H-500Z" fill="#10302B"/>');
  out.push(`<g fill="none" stroke="#21395C">${ROADS.map(([d, w]) => `<path d="${d}" stroke-width="${w}"/>`).join('')}</g>`);
  out.push('<path d="M-300 400H1500" stroke="#17473F" stroke-width="8" fill="none"/>');

  for (let y = -260; y < 1100; y += 52) {
    let wall = '';
    const roofs = ['', '', ''];
    const wins = ['', '', ''];
    for (let x = -280; x < 1030; x += 62) {
      const skip =
        [[365, 440], [205, 250], [565, 610]].some(([a, b]) => y + 42 > a! && y < b!) ||
        [[596, 648], [536, 584], [836, 884]].some(([a, b]) => x + 54 > a! && x < b!) ||
        (x < 250 && y > 625) ||
        Math.abs(x - (270 + (y + 300) * 0.05)) < 28;
      if (skip || r() < 0.09) continue;
      const w = 42 + r() * 14;
      const h = 30 + r() * 12;
      const bx = x + r() * 5;
      const by = y + r() * 4;
      const near = 1 - clamp(Math.abs(y - 400) / 620, 0, 1);
      const H = 8 + r() * r() * 62 * (0.45 + near);
      wall += rect(bx, by + h - H, w, H);
      roofs[H > 42 ? 2 : H > 22 ? 1 : 0] += rect(bx, by - H, w, h);
      if (H > 13 && !plain) {
        for (let wy = by + h - H + 4; wy < by + h - 4; wy += 8) {
          for (let wx = bx + 4; wx < bx + w - 5; wx += 7) {
            const q = r();
            if (q < 0.34) wins[q < 0.1 ? 0 : q < 0.24 ? 1 : 2] += rect(wx, wy, 3.6, 4.2);
          }
        }
      }
    }
    if (wall) out.push(`<path d="${wall}" fill="#14263F"/>`);
    ['#1F3858', '#27476F', '#2F5C8C'].forEach((c, i) => roofs[i] && out.push(`<path d="${roofs[i]}" fill="${c}"/>`));
    ['#FFE5A8', '#9ED7F5', '#5A84B5'].forEach((c, i) => wins[i] && out.push(`<path d="${wins[i]}" fill="${c}"/>`));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 2300 1900" width="2300" height="1900">${out.join('')}</svg>`;
}

export const CITY_BOX = { x: -500, y: -500, width: 2300, height: 1900 } as const;
