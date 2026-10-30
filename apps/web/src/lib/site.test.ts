import { describe, expect, it } from 'vitest';
import { isProductionSite } from './site';

describe('isProductionSite', () => {
  it('is only the live domain', () => {
    expect(isProductionSite('https://tourneasy.com')).toBe(true);
    expect(isProductionSite('https://tourneasy.com/')).toBe(true);
    expect(isProductionSite('https://test.tourneasy.app')).toBe(false);
    expect(isProductionSite('http://localhost:3000')).toBe(false);
    expect(isProductionSite(undefined)).toBe(false);
  });
});
