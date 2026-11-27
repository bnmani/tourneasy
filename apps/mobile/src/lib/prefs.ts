import * as SecureStore from 'expo-secure-store';

/**
 * Small settings kept on this phone between launches (theme, language). Read synchronously, so
 * the first screen already draws with the saved choice and nothing flashes. Reading or writing
 * never throws: without storage (tests, a locked keychain) the app falls back to its defaults.
 */
export function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const value = SecureStore.getItem(key);
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    SecureStore.setItem(key, value);
  } catch {
    // Not saved; the choice still applies until the app closes.
  }
}

export const THEME_KEY = 'pref.theme';
export const LOCALE_KEY = 'pref.locale';
