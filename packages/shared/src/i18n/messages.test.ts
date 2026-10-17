import { describe, expect, it } from 'vitest';
import { isAppLocale, messages, pickLocalized } from './index';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flattenKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('translation files', () => {
  it('nl and en have exactly the same keys', () => {
    const nl = flattenKeys(messages.nl).sort();
    const en = flattenKeys(messages.en).sort();
    expect(en).toEqual(nl);
  });

  it('has no empty strings', () => {
    for (const locale of ['nl', 'en'] as const) {
      const empty = flattenKeys(messages[locale]).filter((path) => {
        const value = path
          .split('.')
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], messages[locale]);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empty, `empty strings in ${locale}`).toEqual([]);
    }
  });
});

describe('locale helpers', () => {
  it('recognises supported locales', () => {
    expect(isAppLocale('nl')).toBe(true);
    expect(isAppLocale('en')).toBe(true);
    expect(isAppLocale('de')).toBe(false);
  });

  it('falls back to Dutch for missing English content', () => {
    expect(pickLocalized({ nl: 'Hallo', en: 'Hello' }, 'en')).toBe('Hello');
    expect(pickLocalized({ nl: 'Hallo' }, 'en')).toBe('Hallo');
    expect(pickLocalized(null, 'nl')).toBe('');
  });
});
