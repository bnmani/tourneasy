import { describe, expect, it } from 'vitest';
import { safeRedirectPath, withStatus } from './urls';

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

describe('withStatus', () => {
  it('puts the status before the #section, so the page reloads', () => {
    expect(withStatus('/en/admin/tournaments/1#food-access', 'saved')).toBe(
      '/en/admin/tournaments/1?status=saved#food-access',
    );
    expect(withStatus('/en/admin/users?q=a', 'saved')).toBe('/en/admin/users?q=a&status=saved');
    expect(withStatus('/en/admin/pricing', 'deleted')).toBe('/en/admin/pricing?status=deleted');
  });
});
