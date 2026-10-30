import { describe, expect, it } from 'vitest';
import { isProductionSite, wwwRedirect } from './site';

describe('isProductionSite', () => {
  it('is only the live domain', () => {
    expect(isProductionSite('https://tourneasy.com')).toBe(true);
    expect(isProductionSite('https://tourneasy.com/')).toBe(true);
    expect(isProductionSite('https://test.tourneasy.app')).toBe(false);
    expect(isProductionSite('http://localhost:3000')).toBe(false);
    expect(isProductionSite(undefined)).toBe(false);
  });
});

describe('wwwRedirect', () => {
  it('sends www to the site address, keeping path and query', () => {
    expect(wwwRedirect('www.tourneasy.com', '/nl/tournaments?q=a', 'https://tourneasy.com')).toBe(
      'https://tourneasy.com/nl/tournaments?q=a',
    );
    expect(wwwRedirect('WWW.tourneasy.com:443', '/', 'https://tourneasy.com')).toBe(
      'https://tourneasy.com/',
    );
  });
  it('leaves every other host alone', () => {
    expect(wwwRedirect('tourneasy.com', '/nl', 'https://tourneasy.com')).toBeNull();
    expect(wwwRedirect('test.tourneasy.app', '/nl', 'https://test.tourneasy.app')).toBeNull();
    expect(wwwRedirect('localhost:3000', '/nl', 'http://localhost:3000')).toBeNull();
    expect(wwwRedirect(null, '/nl', 'https://tourneasy.com')).toBeNull();
  });
});
