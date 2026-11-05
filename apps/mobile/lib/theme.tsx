import { THEMES, THEME_STORAGE_KEY, type ThemeName, type ThemeTokens } from '@winou/config';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { prefs } from './storage';

/**
 * Light / dark, shared with the web app's tokens (packages/config). Follows the phone's
 * setting until the user picks one on the Account screen; the choice is saved.
 */
interface ThemeValue {
  T: ThemeTokens;
  name: ThemeName;
  /** null = follow the phone */
  choice: ThemeName | null;
  setChoice: (t: ThemeName | null) => void;
}

const Ctx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeName | null>(null);

  useEffect(() => {
    void prefs.getItem(THEME_STORAGE_KEY).then((v) => (v === 'light' || v === 'dark') && setChoiceState(v));
  }, []);

  const setChoice = useCallback((t: ThemeName | null) => {
    setChoiceState(t);
    void (t ? prefs.setItem(THEME_STORAGE_KEY, t) : prefs.removeItem(THEME_STORAGE_KEY));
  }, []);

  const name: ThemeName = choice ?? (device === 'dark' ? 'dark' : 'light');
  const value = useMemo(() => ({ T: THEMES[name], name, choice, setChoice }), [name, choice, setChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
