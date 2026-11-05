/**
 * The home page's night city: an ILLUSTRATION (not map data), drawn once into a cached SVG,
 * plus the names and plates of the simulated example vehicles.
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

export type ExampleVehicle = 'car' | 'moto' | 'trot' | 'kia';

const PLATES: Record<ExampleVehicle, string> = { car: '245 TUN 7812', moto: '77 TUN 2106', trot: 'TR-014', kia: '220 TUN 9087' };

/** Example vehicle names (made-up fleet), localized where a word is involved. */
export function exampleVehicle(who: ExampleVehicle, locale: string, labels: { moto: string; trot: string }) {
  const name =
    who === 'car' ? 'Renault Clio' : who === 'kia' ? 'Kia Picanto' : who === 'moto' ? (locale === 'fr' ? 'Moto Yamaha' : 'Yamaha') : `${labels.trot} 014`;
  const plate = locale === 'ar' ? PLATES[who].replace('TUN', 'تونس') : PLATES[who];
  return { name, plate };
}

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
