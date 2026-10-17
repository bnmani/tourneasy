import { describe, expect, it } from 'vitest';
import { routing } from './routing';

describe('i18n routing', () => {
  it('serves Dutch by default and English as second language', () => {
    expect(routing.defaultLocale).toBe('nl');
    expect([...routing.locales]).toEqual(['nl', 'en']);
  });

  it('always prefixes the locale in the URL', () => {
    expect(routing.localePrefix).toBe('always');
  });
});
