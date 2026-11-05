/**
 * Shared design tokens for the logged-in app (web and mobile), light and dark.
 * Web: emitted as CSS custom properties by themeCss() in the root layout.
 * Mobile: read directly from THEMES.
 *
 * Text colours were checked against their backgrounds (WCAG AA, 4.5:1 for normal text):
 * ink, sub, status and alert colours on bg/surf/surf2 and on their own tinted backgrounds.
 */
export type ThemeName = 'light' | 'dark';

export interface ThemeTokens {
  /** page background */
  bg: string;
  /** cards, panels */
  surf: string;
  /** inputs, hovered rows, secondary buttons */
  surf2: string;
  /** dividers */
  line: string;
  ink: string;
  sub: string;
  navtxt: string;
  /** primary actions, active states */
  acc: string;
  onacc: string;
  /** turquoise used as text (readable on bg/surf) */
  acctxt: string;
  zebra: string;
  moving: string;
  stopped: string;
  offline: string;
  okbg: string;
  infobg: string;
  warn: string;
  warnbg: string;
  danger: string;
  dangerbg: string;
  /** street plaque blue (same in both themes) */
  plaque: string;
  /** map palette */
  map: { land: string; water: string; green: string; block: string; block2: string; road: string; roadMajor: string; casing: string; label: string; halo: string; route: string };
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: {
    bg: '#EDF2F7',
    surf: '#FFFFFF',
    surf2: '#E4EBF3',
    line: '#D3DCE7',
    ink: '#0B1B33',
    sub: '#43556D',
    navtxt: '#33465E',
    acc: '#0A8079',
    onacc: '#FFFFFF',
    acctxt: '#087069',
    zebra: '#F4F7FA',
    moving: '#087069',
    stopped: '#2B5A97',
    offline: '#556275',
    okbg: '#DDF2EF',
    infobg: '#E3EBF6',
    warn: '#9A4A06',
    warnbg: '#FDEDDD',
    danger: '#B42318',
    dangerbg: '#FDECEA',
    plaque: '#0F4DB8',
    map: {
      land: '#E5EBF1',
      water: '#B4E0EC',
      green: '#CFE6D3',
      block: '#D0DAE5',
      block2: '#BFCCDB',
      road: '#FFFFFF',
      roadMajor: '#FFFFFF',
      casing: '#C9D4E1',
      label: '#33465E',
      halo: '#FFFFFF',
      route: '#0A8079',
    },
  },
  dark: {
    bg: '#070F1E',
    surf: '#0E1B31',
    surf2: '#182B48',
    line: '#22385A',
    ink: '#F3F7FC',
    sub: '#B4C3D7',
    navtxt: '#C9D6E6',
    acc: '#3FE0D0',
    onacc: '#06202A',
    acctxt: '#3FE0D0',
    zebra: '#12233D',
    moving: '#3FE0D0',
    stopped: '#93BCF2',
    offline: '#A9B6C8',
    okbg: '#0D3533',
    infobg: '#17304F',
    warn: '#FFC48A',
    warnbg: '#3A2611',
    danger: '#FF9C92',
    dangerbg: '#3D1715',
    plaque: '#0F4DB8',
    map: {
      land: '#0B1729',
      water: '#0E3350',
      green: '#10302B',
      block: '#1D3350',
      block2: '#27476F',
      road: '#2E4B70',
      roadMajor: '#3A5C86',
      casing: '#0A1425',
      label: '#C9D6E6',
      halo: '#070F1E',
      route: '#3FE0D0',
    },
  },
};

/** localStorage key holding "light" or "dark" once the user has chosen; absent = follow the device. */
export const THEME_STORAGE_KEY = 'intorue.theme';

/** CSS custom properties for both themes: light by default, dark under [data-theme="dark"]. */
export function themeCss(): string {
  const vars = (t: ThemeTokens) =>
    Object.entries(t)
      .flatMap(([k, v]) => (typeof v === 'string' ? [`--${k}:${v}`] : Object.entries(v).map(([mk, mv]) => `--map-${mk}:${mv}`)))
      .join(';');
  return `:root{${vars(THEMES.light)};color-scheme:light}:root[data-theme="dark"]{${vars(THEMES.dark)};color-scheme:dark}`;
}

/**
 * Runs in <head> before the page paints: applies the saved theme, or the device's, so there is
 * no flash of the wrong theme. Kept tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;
