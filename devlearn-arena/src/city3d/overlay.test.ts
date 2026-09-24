import { describe, expect, it } from 'vitest';
import { buildCity, type City } from '@/city/model';
import { createSession } from '@/engines/kernel/session';
import { layoutCity } from './model';
import { OVERLAY } from './palette';
import { INFO_VIEWS, overlayFor, residentColor, type InfoView } from './overlay';

/**
 * 情報表示。街の上に色で重ねるものを、配置から導く。
 * 同じ配置からは必ず同じ重ね方になる。
 */

function town(): City {
  const session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/notes.txt': 'a',
      '/home/learner/src': null,
      '/home/learner/src/main.ts': 'b',
    },
  });
  return buildCity({ vfs: session.state.vfs, unlocked: ['center', 'kernel', 'git', 'k8s', 'net', 'github'] });
}

const layout = layoutCity(town());

describe('情報表示の種類', () => {
  it('住人の状態・バス路線・交通・系譜の 4 つ', () => {
    expect(INFO_VIEWS).toEqual(['residents', 'bus', 'traffic', 'lineage']);
  });
});

describe('重ねるものを導く', () => {
  it('何も選んでいなければ、何も重ねない', () => {
    expect(overlayFor(null, layout)).toEqual({ discs: [], links: [] });
  });

  it('同じ配置からは必ず同じ重ね方になる', () => {
    for (const view of INFO_VIEWS) {
      expect(overlayFor(view, layout)).toEqual(overlayFor(view, layout));
    }
  });

  it('住人の状態は、建物すべてに円を敷く。線は引かない', () => {
    const overlay = overlayFor('residents', layout);
    expect(overlay.discs.length).toBe(layout.buildings.length);
    expect(overlay.links).toEqual([]);
  });

  it('円は建物の底面より大きい。上から見て分かるようにする', () => {
    const overlay = overlayFor('residents', layout);
    for (const disc of overlay.discs) {
      const building = layout.buildings.find((b) => b.id === disc.id);
      const foot = Math.max(building?.params.footprint.w ?? 0, building?.params.footprint.d ?? 0);
      expect(disc.radius).toBeGreaterThan(foot / 2);
    }
  });

  it('住人の様子で色が変わる', () => {
    const base = layout.buildings[0];
    expect(base).toBeDefined();
    if (base === undefined) return;
    const put = (states: ('settled' | 'sick' | 'moving' | 'gone')[]) => ({
      ...base,
      occupants: states.map((state, i) => ({ id: String(i), label: String(i), state, floor: 1 })),
    });
    expect(residentColor(put([]))).toBe(OVERLAY.empty);
    expect(residentColor(put(['gone']))).toBe(OVERLAY.empty);
    expect(residentColor(put(['settled', 'settled']))).toBe(OVERLAY.good);
    expect(residentColor(put(['settled', 'moving']))).toBe(OVERLAY.moving);
    expect(residentColor(put(['moving', 'sick']))).toBe(OVERLAY.bad);
  });

  it('見方ごとに、関わる建物だけを出す', () => {
    const kinds = (view: InfoView): Set<string> => {
      const ids = new Set(overlayFor(view, layout).discs.map((d) => d.id));
      return new Set(layout.buildings.filter((b) => ids.has(b.id)).map((b) => b.kind));
    };
    for (const kind of kinds('traffic')) expect(['relay', 'gate', 'house']).toContain(kind);
    for (const kind of kinds('lineage')) expect(['monument', 'flag', 'depot']).toContain(kind);
    for (const kind of kinds('bus')) expect(['stop', 'tower', 'office']).toContain(kind);
  });

  it('線は、その見方に出ている建物どうしだけを結ぶ', () => {
    for (const view of ['bus', 'traffic', 'lineage'] as const) {
      const overlay = overlayFor(view, layout);
      const ids = new Set(overlay.discs.map((d) => d.id));
      for (const link of overlay.links) {
        const found = layout.links.find((l) => l.id === link.id);
        expect(found).toBeDefined();
        expect(ids.has(found?.from ?? '')).toBe(true);
        expect(ids.has(found?.to ?? '')).toBe(true);
      }
    }
  });

  it('住人の状態では線を引かない', () => {
    expect(overlayFor('residents', layout).links).toEqual([]);
  });
});
