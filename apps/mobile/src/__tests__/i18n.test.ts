import { translate } from '@/lib/i18n';

describe('translate', () => {
  it('returns the English text unchanged', () => {
    expect(translate('en', 'Sign in')).toBe('Sign in');
  });

  it('uses the Dutch text when the locale is nl', () => {
    expect(translate('nl', 'Sign in')).toBe('Inloggen');
  });

  it('falls back to English for a string with no Dutch entry', () => {
    expect(translate('nl', 'A string nobody translated')).toBe('A string nobody translated');
  });

  it('fills placeholders from the values', () => {
    expect(translate('en', 'Hello, {name}', { name: 'Sam' })).toBe('Hello, Sam');
    expect(translate('nl', 'Hello, {name}', { name: 'Sam' })).toBe('Hallo, Sam');
  });

  it('keeps placeholders that have no value', () => {
    expect(translate('en', 'Hello, {name}')).toBe('Hello, {name}');
  });
});
