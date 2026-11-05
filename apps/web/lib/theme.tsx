'use client';

import { THEME_STORAGE_KEY, type ThemeName } from '@winou/config';
import { useSyncExternalStore } from 'react';

/**
 * Light / dark theme. The root layout's boot script sets <html data-theme> before paint (saved
 * choice, else the device setting); this module keeps it in sync afterwards:
 *  - a click on the theme switch saves the choice;
 *  - with no saved choice, the page follows the device when its setting changes;
 *  - other open tabs follow a change made in one tab.
 */
const listeners = new Set<() => void>();
const read = (): ThemeName => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function saved(): ThemeName | null {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function apply(t: ThemeName) {
  if (document.documentElement.dataset.theme === t) return;
  document.documentElement.dataset.theme = t;
  listeners.forEach((l) => l());
}

export function setTheme(t: ThemeName) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* storage unavailable: applies to this page only */
  }
  apply(t);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onDevice = () => !saved() && apply(media.matches ? 'dark' : 'light');
  const onStorage = (e: StorageEvent) => e.key === THEME_STORAGE_KEY && apply(saved() ?? (media.matches ? 'dark' : 'light'));
  media.addEventListener('change', onDevice);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener('change', onDevice);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as ThemeName);
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
