import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { readPref, THEME_KEY, writePref } from '@/lib/prefs';

/** Colour tokens. */
export type Colors = {
  /** True for the dark theme: light status bar text, the logo in its own colours. */
  dark: boolean;
  bg: string;
  fg: string;
  card: string;
  muted: string;
  border: string;
  inputBorder: string;
  /** Accent: links, times, switches, selected chips and live badges. */
  primary: string;
  primaryFg: string;
  destructive: string;
  scrim: string;
  hero: string;
  heroFg: string;
  heroMuted: string;
  /** Shadows that lift buttons and cards on the left, right and underneath. */
  lift: string;
  liftPressed: string;
  liftSmall: string;
};

function shadows(color: string, soft: string) {
  return {
    lift: `-14px 10px 22px -10px ${color}, 14px 10px 22px -10px ${color}, 0px 16px 26px -8px ${color}, 0px 2px 4px 0px ${soft}`,
    liftPressed: `-8px 5px 12px -8px ${color}, 8px 5px 12px -8px ${color}, 0px 6px 12px -6px ${color}`,
    liftSmall: `-6px 4px 10px -6px ${color}, 6px 4px 10px -6px ${color}, 0px 5px 10px -4px ${color}`,
  };
}

/**
 * Theme 3, the approved design: ink-navy background #293541 with #EDEAE3 text and #BEB196 for
 * labels. Buttons and cards are the background colour too, set apart by a thin light outline
 * and a shadow on both sides so they float.
 */
const dark: Colors = {
  dark: true,
  bg: '#293541',
  fg: '#edeae3',
  card: '#293541',
  muted: '#beb196',
  border: 'rgba(190, 177, 150, 0.5)',
  inputBorder: 'rgba(190, 177, 150, 0.6)',
  primary: '#beb196',
  primaryFg: '#293541',
  destructive: '#f0a293',
  scrim: 'rgba(0, 0, 0, 0.55)',
  hero: '#293541',
  heroFg: '#edeae3',
  heroMuted: '#beb196',
  ...shadows('rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.22)'),
};

/**
 * Theme 3 light (option 1): sand background #D8CFBC with #293541 text and walnut #594235 for
 * labels. The same floating pills, with a dark outline and a softer navy shadow.
 */
const light: Colors = {
  dark: false,
  bg: '#d8cfbc',
  fg: '#293541',
  card: '#d8cfbc',
  muted: '#594235',
  border: 'rgba(41, 53, 65, 0.35)',
  inputBorder: 'rgba(41, 53, 65, 0.45)',
  primary: '#594235',
  primaryFg: '#edeae3',
  destructive: '#a3402e',
  scrim: 'rgba(41, 53, 65, 0.45)',
  hero: '#d8cfbc',
  heroFg: '#293541',
  heroMuted: '#594235',
  ...shadows('rgba(41, 53, 65, 0.32)', 'rgba(41, 53, 65, 0.15)'),
};

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeValue = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  colors: Colors;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // The saved choice, read before the first screen draws.
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readPref(THEME_KEY, ['light', 'dark', 'system'] as const) ?? 'system',
  );
  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    writePref(THEME_KEY, value);
  }, []);

  // iOS pop-ups, the keyboard and the share sheet follow the app's choice too.
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    return { preference, setPreference, colors: scheme === 'light' ? light : dark };
  }, [preference, setPreference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}

export function useColors(): Colors {
  return useTheme().colors;
}

/**
 * Font families loaded in the root layout. Fraunces is for display headings;
 * Inter is for everything else, picked by weight.
 */
export const font = {
  display: 'Fraunces_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
