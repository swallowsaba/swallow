import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS } from './export-options';
import { EXPORT_PRESETS } from './export-presets';
import {
  batchFilenameTemplate,
  batchOptionsFor,
  dedupePresetIds,
  presetSuffix,
} from './batch-export';

const preset = (id: string) => EXPORT_PRESETS.find((p) => p.id === id)!;

describe('presetSuffix', () => {
  it('uses the size for resized presets and the id for full-size', () => {
    expect(presetSuffix(preset('insta-square'))).toBe('1080px');
    expect(presetSuffix(preset('4k'))).toBe('3840px');
    expect(presetSuffix(preset('original'))).toBe('original');
  });
});

describe('batchFilenameTemplate', () => {
  it('appends the suffix when there is no size token', () => {
    expect(batchFilenameTemplate('{name}', '1080px')).toBe('{name}_1080px');
  });

  it('inserts before the extension token', () => {
    expect(batchFilenameTemplate('{name}.{ext}', '1080px')).toBe('{name}_1080px.{ext}');
  });

  it('leaves templates that already vary by size alone', () => {
    expect(batchFilenameTemplate('{name}_{w}x{h}', '1080px')).toBe('{name}_{w}x{h}');
  });
});

describe('batchOptionsFor', () => {
  it('applies the preset and a collision-safe filename', () => {
    const base = { ...DEFAULT_EXPORT_OPTIONS, filenameTemplate: '{name}.{ext}' };
    const opts = batchOptionsFor(base, preset('story'));
    expect(opts.resize).toEqual({ mode: 'longEdge', value: 1920 });
    expect(opts.filenameTemplate).toBe('{name}_1920px.{ext}');
  });

  it('keeps distinct filenames across presets', () => {
    const base = { ...DEFAULT_EXPORT_OPTIONS, filenameTemplate: '{name}.{ext}' };
    const a = batchOptionsFor(base, preset('insta-square')).filenameTemplate;
    const b = batchOptionsFor(base, preset('4k')).filenameTemplate;
    expect(a).not.toBe(b);
  });
});

describe('dedupePresetIds', () => {
  it('removes duplicates preserving order', () => {
    expect(dedupePresetIds(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });
});
