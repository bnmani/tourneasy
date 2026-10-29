import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './urls';

describe('safeRedirectPath', () => {
  it('keeps same-site paths', () => {
    expect(safeRedirectPath('/nl/account?tab=schedule#x', '/')).toBe('/nl/account?tab=schedule#x');
    expect(safeRedirectPath('/nl/admin/../account', '/')).toBe('/nl/account');
  });

  it('refuses other sites, also via tricks browsers undo', () => {
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r\n/evil.com',
      '\\\\evil.com',
      'javascript:alert(1)',
      ' /account',
      42,
      null,
    ])
      expect(safeRedirectPath(bad, '/fallback')).toBe('/fallback');
  });
});
