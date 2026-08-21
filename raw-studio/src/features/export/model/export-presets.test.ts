import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS } from './export-options';
import {
  applyExportPreset,
  EXPORT_PRESETS,
  matchExportPreset,
} from './export-presets';

describe('EXPORT_PRESETS', () => {
  it('has unique ids and sensible values', () => {
    const ids = EXPORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of EXPORT_PRESETS) {
      expect(p.quality).toBeGreaterThanOrEqual(0);
      expect(p.quality).toBeLessThanOrEqual(100);
      expect(p.labelKey.startsWith('exportPreset.')).toBe(true);
    }
  });
});

describe('applyExportPreset', () => {
  it('sets format/quality/resize from the preset', () => {
    const out = applyExportPreset(DEFAULT_EXPORT_OPTIONS, 'insta-square');
    expect(out.format).toBe('jpeg');
    expect(out.quality).toBe(90);
    expect(out.resize).toEqual({ mode: 'longEdge', value: 1080 });
  });

  it('keeps the base filename template and watermark', () => {
    const base = {
      ...DEFAULT_EXPORT_OPTIONS,
      filenameTemplate: 'my_{name}',
      watermark: { ...DEFAULT_EXPORT_OPTIONS.watermark, enabled: true },
    };
    const out = applyExportPreset(base, 'story');
    expect(out.filenameTemplate).toBe('my_{name}');
    expect(out.watermark.enabled).toBe(true);
  });

  it('returns the base unchanged for an unknown id', () => {
    expect(applyExportPreset(DEFAULT_EXPORT_OPTIONS, 'nope')).toEqual(DEFAULT_EXPORT_OPTIONS);
  });

  it('produces a fresh resize object (no shared reference)', () => {
    const out = applyExportPreset(DEFAULT_EXPORT_OPTIONS, '4k');
    const preset = EXPORT_PRESETS.find((p) => p.id === '4k')!;
    expect(out.resize).toEqual(preset.resize);
    expect(out.resize).not.toBe(preset.resize);
  });
});

describe('matchExportPreset', () => {
  it('finds the matching preset for options built from it', () => {
    const out = applyExportPreset(DEFAULT_EXPORT_OPTIONS, 'web-small');
    expect(matchExportPreset(out)).toBe('web-small');
  });

  it('returns null for a custom combination', () => {
    const custom = { ...DEFAULT_EXPORT_OPTIONS, quality: 73, resize: { mode: 'percent' as const, value: 50 } };
    expect(matchExportPreset(custom)).toBeNull();
  });
});
