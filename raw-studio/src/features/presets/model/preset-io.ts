import type { Preset, PresetCategory, PresetExport } from '@/types';
import { createId } from '@/utils';

/** Serialize presets to the shareable JSON envelope. */
export function serializePresets(presets: readonly Preset[]): string {
  const payload: PresetExport = {
    schema: 'raw-studio/preset',
    version: 1,
    presets: [...presets],
  };
  return JSON.stringify(payload, null, 2);
}

export type ParseResult =
  | { ok: true; presets: Preset[] }
  | { ok: false; error: string };

const CATEGORIES: readonly PresetCategory[] = [
  'portrait',
  'landscape',
  'night',
  'vintage',
  'film',
  'cinematic',
  'street',
  'wedding',
  'travel',
  'bw',
  'user',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function coerceCategory(v: unknown): PresetCategory {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
    ? (v as PresetCategory)
    : 'user';
}

/** Normalize an untrusted object into a fresh user Preset, or null if invalid. */
function normalizePreset(raw: unknown): Preset | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== 'string') return null;
  if (!isRecord(raw.adjustments)) return null;
  const now = Date.now();
  return {
    id: createId('pre'),
    name: raw.name,
    category: coerceCategory(raw.category),
    favorite: raw.favorite === true,
    builtin: false,
    createdAt: now,
    updatedAt: now,
    adjustments: raw.adjustments as Preset['adjustments'],
  };
}

/** Parse and validate a preset JSON file. */
export function parsePresets(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON file.' };
  }
  if (!isRecord(data) || data.schema !== 'raw-studio/preset') {
    return { ok: false, error: 'Not a RAW Studio preset file.' };
  }
  if (!Array.isArray(data.presets)) {
    return { ok: false, error: 'The file has no presets array.' };
  }
  const presets: Preset[] = [];
  for (const item of data.presets) {
    const normalized = normalizePreset(item);
    if (normalized) presets.push(normalized);
  }
  if (presets.length === 0) {
    return { ok: false, error: 'No valid presets found in the file.' };
  }
  return { ok: true, presets };
}
