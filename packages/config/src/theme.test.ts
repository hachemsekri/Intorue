import { describe, expect, it } from 'vitest';
import { THEMES, themeCss, type ThemeTokens } from './theme';

const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

type Key = keyof Omit<ThemeTokens, 'map'>;
/** Text colour on background, minimum ratio (WCAG AA: 4.5 for text, 3 for large text and UI parts). */
const PAIRS: [Key, Key, number][] = [
  ['ink', 'bg', 4.5],
  ['ink', 'surf', 4.5],
  ['ink', 'surf2', 4.5],
  ['sub', 'bg', 4.5],
  ['sub', 'surf', 4.5],
  ['sub', 'surf2', 4.5],
  ['navtxt', 'bg', 4.5],
  ['onacc', 'acc', 4.5],
  ['acctxt', 'surf', 4.5],
  ['acctxt', 'bg', 4.5],
  ['moving', 'surf', 4.5],
  ['moving', 'okbg', 4.5],
  ['stopped', 'surf', 4.5],
  ['stopped', 'infobg', 4.5],
  ['offline', 'surf', 4.5],
  ['warn', 'surf', 4.5],
  ['warn', 'warnbg', 4.5],
  ['danger', 'surf', 4.5],
  ['danger', 'dangerbg', 4.5],
  ['bg', 'ink', 4.5],
  ['acc', 'bg', 3],
  ['acc', 'surf', 3],
];

describe('theme tokens', () => {
  for (const [name, t] of Object.entries(THEMES)) {
    it(`${name}: text colours meet WCAG AA contrast`, () => {
      const failures = PAIRS.filter(([a, b, min]) => contrast(t[a], t[b]) < min).map(([a, b]) => `${a} on ${b}: ${contrast(t[a], t[b]).toFixed(2)}`);
      expect(failures).toEqual([]);
    });
  }
  it('both themes define the same tokens', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort());
    expect(Object.keys(THEMES.dark.map).sort()).toEqual(Object.keys(THEMES.light.map).sort());
  });
  it('emits CSS variables for both themes', () => {
    const css = themeCss();
    expect(css).toContain('--acc:#0A8079');
    expect(css).toContain(':root[data-theme="dark"]{--bg:#070F1E');
    expect(css).toContain('--map-water:');
  });
});
