import { describe, expect, it } from 'vitest';
import { directionsUrl, housekeepingMinutes, isProductionSite, wwwRedirect } from './site';

describe('isProductionSite', () => {
  it('is only the live domain', () => {
    expect(isProductionSite('https://tourneasy.com')).toBe(true);
    expect(isProductionSite('https://tourneasy.com/')).toBe(true);
    expect(isProductionSite('https://test.tourneasy.app')).toBe(false);
    expect(isProductionSite('http://localhost:3000')).toBe(false);
    expect(isProductionSite(undefined)).toBe(false);
  });
});

describe('housekeepingMinutes', () => {
  it('runs every 15 minutes live and every 60 elsewhere', () => {
    expect(housekeepingMinutes('https://tourneasy.com', undefined)).toBe(15);
    expect(housekeepingMinutes('https://test.tourneasy.app', undefined)).toBe(60);
    expect(housekeepingMinutes(undefined, undefined)).toBe(60);
  });
  it('takes a sensible override and ignores the rest', () => {
    expect(housekeepingMinutes('https://tourneasy.com', '30')).toBe(30);
    expect(housekeepingMinutes('https://tourneasy.com', '1')).toBe(15);
    expect(housekeepingMinutes('https://tourneasy.com', 'often')).toBe(15);
    expect(housekeepingMinutes('https://test.tourneasy.app', '')).toBe(60);
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

describe('directionsUrl (D108)', () => {
  const venue = {
    name: 'Sporthal Nobelhorst',
    street: 'Rosalind Franklinweg',
    houseNumber: '6',
    postcode: '1341 HZ',
    city: 'Almere',
    latitude: null,
    longitude: null,
  };
  it('routes to the address, or to the coordinates when the venue has them', () => {
    expect(directionsUrl(venue)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Sporthal%20Nobelhorst%2C%20Rosalind%20Franklinweg%206%2C%201341%20HZ%20Almere',
    );
    expect(directionsUrl({ ...venue, latitude: 52.39, longitude: 5.28 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=52.39%2C5.28',
    );
  });
});
