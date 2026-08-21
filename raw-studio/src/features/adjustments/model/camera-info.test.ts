import { describe, expect, it } from 'vitest';
import {
  exposureSummary,
  formatAperture,
  formatCamera,
  formatFocalLength,
  formatIso,
  formatShutter,
} from './camera-info';

describe('formatIso', () => {
  it('formats and rejects invalid values', () => {
    expect(formatIso(1600)).toBe('ISO 1600');
    expect(formatIso(100.4)).toBe('ISO 100');
    expect(formatIso(undefined)).toBeNull();
    expect(formatIso(0)).toBeNull();
    expect(formatIso(Number.NaN)).toBeNull();
  });
});

describe('formatFocalLength', () => {
  it('formats millimetres', () => {
    expect(formatFocalLength(600)).toBe('600 mm');
    expect(formatFocalLength(24.6)).toBe('25 mm');
    expect(formatFocalLength(undefined)).toBeNull();
  });
});

describe('formatAperture', () => {
  it('drops the decimal for whole stops', () => {
    expect(formatAperture(4)).toBe('f/4');
    expect(formatAperture(3.5)).toBe('f/3.5');
    expect(formatAperture(2.83)).toBe('f/2.8');
    expect(formatAperture(undefined)).toBeNull();
  });
});

describe('formatShutter', () => {
  it('uses fractions below a second', () => {
    expect(formatShutter(1 / 4000)).toBe('1/4000');
    expect(formatShutter(0.5)).toBe('1/2');
  });

  it('uses seconds at or above one', () => {
    expect(formatShutter(1)).toBe('1"');
    expect(formatShutter(2.5)).toBe('2.5"');
  });

  it('rejects invalid values', () => {
    expect(formatShutter(undefined)).toBeNull();
    expect(formatShutter(0)).toBeNull();
  });
});

describe('formatCamera', () => {
  it('joins make and model', () => {
    expect(formatCamera({ make: 'Canon', model: 'EOS R5' })).toBe('Canon EOS R5');
  });

  it("doesn't repeat the make when the model already has it", () => {
    expect(formatCamera({ make: 'SONY', model: 'SONY ILCE-7M4' })).toBe('SONY ILCE-7M4');
  });

  it('handles partial or missing metadata', () => {
    expect(formatCamera({ model: 'ILCE-7M4' })).toBe('ILCE-7M4');
    expect(formatCamera({})).toBeNull();
    expect(formatCamera(undefined)).toBeNull();
  });
});

describe('exposureSummary', () => {
  it('returns the four facts in order', () => {
    expect(
      exposureSummary({ iso: 1600, focalLength: 600, aperture: 4, shutter: 1 / 6400 }),
    ).toEqual(['ISO 1600', '600 mm', 'f/4', '1/6400']);
  });

  it('skips missing fields', () => {
    expect(exposureSummary({ iso: 400 })).toEqual(['ISO 400']);
    expect(exposureSummary(undefined)).toEqual([]);
    expect(exposureSummary({})).toEqual([]);
  });
});
