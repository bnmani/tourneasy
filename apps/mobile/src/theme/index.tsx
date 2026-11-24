import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/** Colour tokens from the approved Phase 1 mock-ups (light and dark). */
export type Colors = {
  bg: string;
  fg: string;
  card: string;
  muted: string;
  border: string;
  inputBorder: string;
  primary: string;
  primaryFg: string;
  destructive: string;
  scrim: string;
  hero: string;
  heroFg: string;
  heroMuted: string;
};

const light: Colors = {
  bg: '#f3fafb',
  fg: '#003135',
  card: '#ffffff',
  muted: '#3b5f63',
  border: '#afdde5',
  inputBorder: '#9fd0d9',
  primary: '#024950',
  primaryFg: '#ffffff',
  destructive: '#a3402e',
  scrim: 'rgba(0, 49, 53, 0.45)',
  hero: '#003135',
  heroFg: '#f3fafb',
  heroMuted: '#afdde5',
};

const dark: Colors = {
  bg: '#003135',
  fg: '#f3fafb',
  card: '#024950',
  muted: '#afdde5',
  border: '#0fa4af',
  inputBorder: '#0fa4af',
  primary: '#0fa4af',
  primaryFg: '#003135',
  destructive: '#f0a293',
  scrim: 'rgba(0, 0, 0, 0.5)',
  hero: '#024950',
  heroFg: '#f3fafb',
  heroMuted: '#afdde5',
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
  const [preference, setPreference] = useState<ThemePreference>('system');

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return { preference, setPreference, colors: scheme === 'dark' ? dark : light };
  }, [preference, system]);

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

/** Splash background: the logo's own teal, the same in both themes. */
export const splashBackground = '#024950';
