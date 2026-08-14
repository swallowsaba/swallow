import { describe, expect, it } from 'vitest';
import { formatPlace, mapsUrl } from './geocode';

describe('formatPlace', () => {
  it('prefers a city/state/country summary over the raw display_name', () => {
    const place = formatPlace({
      display_name: '123 Some Long Street, Some District, Tokyo, 100-0001, Japan',
      address: { city: 'Tokyo', country: 'Japan' },
    });
    expect(place).toBe('Tokyo, Japan');
  });

  it('falls back to town or village when city is absent', () => {
    expect(formatPlace({ address: { town: 'Hakone' } })).toBe('Hakone');
    expect(formatPlace({ address: { village: 'Shirakawa' } })).toBe('Shirakawa');
  });

  it('falls back to display_name when no usable address fields exist', () => {
    expect(formatPlace({ display_name: 'Somewhere, Earth' })).toBe('Somewhere, Earth');
  });

  it('falls back to a generic label when nothing is available', () => {
    expect(formatPlace({})).toBe('Unknown location');
  });
});

describe('mapsUrl', () => {
  it('builds a Google Maps query URL from coordinates', () => {
    expect(mapsUrl(35.6812, 139.7671)).toBe('https://www.google.com/maps?q=35.6812,139.7671');
  });
});
