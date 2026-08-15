import { describe, expect, it } from 'vitest';
import type { EditState, Overlay, TextOverlay } from '@/types';
import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import {
  addOverlay,
  defaultEmojiOverlay,
  defaultFrameOverlay,
  defaultTextOverlay,
  fontString,
  getOverlay,
  moveOverlay,
  removeOverlay,
  reorderOverlay,
  resolveEmojiLayout,
  resolveFrameGeometry,
  resolveTextLayout,
  updateOverlay,
} from './overlay-ops';

function state(): EditState {
  return createDefaultEditState('img1', 0);
}

/** Narrow an overlay to a text overlay in tests (throws if it isn't one). */
function asText(o: Overlay | undefined): TextOverlay {
  if (!o || o.kind !== 'text') throw new Error('expected a text overlay');
  return o;
}

describe('overlay transitions', () => {
  it('adds without mutating input', () => {
    const s0 = state();
    const s1 = addOverlay(s0, defaultTextOverlay('Hi'));
    expect(s0.overlays.length).toBe(0);
    expect(s1.overlays.length).toBe(1);
    expect(asText(s1.overlays[0]).text).toBe('Hi');
  });

  it('updates fields by id', () => {
    let s = addOverlay(state(), defaultTextOverlay('Hi'));
    const id = s.overlays[0]!.id;
    s = updateOverlay(s, id, { text: 'Bye', color: '#ff0000', fontSize: 0.2 });
    expect(asText(s.overlays[0]).text).toBe('Bye');
    expect(asText(s.overlays[0]).color).toBe('#ff0000');
    expect(asText(s.overlays[0]).fontSize).toBe(0.2);
  });

  it('moves and clamps position', () => {
    let s = addOverlay(state(), defaultTextOverlay('Hi'));
    const id = s.overlays[0]!.id;
    s = moveOverlay(s, id, 1.5, -0.5);
    expect(asText(s.overlays[0]).x).toBe(1);
    expect(asText(s.overlays[0]).y).toBe(0);
  });

  it('removes and reorders', () => {
    let s = state();
    const a = defaultTextOverlay('A');
    const b = defaultTextOverlay('B');
    s = addOverlay(addOverlay(s, a), b);
    expect(s.overlays.map((o) => o.id)).toEqual([a.id, b.id]);
    s = reorderOverlay(s, a.id, 'up');
    expect(s.overlays.map((o) => o.id)).toEqual([b.id, a.id]);
    s = removeOverlay(s, a.id);
    expect(s.overlays.map((o) => o.id)).toEqual([b.id]);
  });

  it('getOverlay resolves by id', () => {
    const s = addOverlay(state(), defaultTextOverlay('Hi'));
    const id = s.overlays[0]!.id;
    const got = getOverlay(s, id);
    expect(got?.kind === 'text' && got.text).toBe('Hi');
    expect(getOverlay(s, null)).toBeNull();
    expect(getOverlay(s, 'nope')).toBeNull();
  });
});

describe('resolveTextLayout', () => {
  it('scales font to the shorter edge and positions by normalized coords', () => {
    const o = { ...defaultTextOverlay('Hello'), x: 0.5, y: 0.25, fontSize: 0.1, strokeWidth: 0.2 };
    const layout = resolveTextLayout(o, { width: 2000, height: 1000 });
    expect(layout.fontPx).toBeCloseTo(100, 5); // 0.1 * 1000 (shorter edge)
    expect(layout.x).toBeCloseTo(1000, 5);
    expect(layout.y).toBeCloseTo(250, 5);
    expect(layout.strokePx).toBeCloseTo(20, 5); // 0.2 * 100
    expect(layout.lineHeightPx).toBeCloseTo(120, 5);
  });

  it('splits multi-line text', () => {
    const o = { ...defaultTextOverlay('a\nb\nc') };
    expect(resolveTextLayout(o, { width: 100, height: 100 }).lines).toEqual(['a', 'b', 'c']);
  });
});

describe('fontString', () => {
  it('includes weight, size and family; italic when set', () => {
    const o = defaultTextOverlay('x');
    expect(fontString(o, 48)).toBe('700 48px Inter, system-ui, sans-serif');
    expect(fontString({ ...o, italic: true }, 48)).toBe(
      'italic 700 48px Inter, system-ui, sans-serif',
    );
  });
});

describe('emoji overlays', () => {
  it('adds an emoji sticker and keeps mixed kinds in the list', () => {
    let s = addOverlay(state(), defaultTextOverlay('Hi'));
    s = addOverlay(s, defaultEmojiOverlay('✨'));
    expect(s.overlays.map((o) => o.kind)).toEqual(['text', 'emoji']);
    const emo = s.overlays[1];
    expect(emo?.kind === 'emoji' && emo.emoji).toBe('✨');
  });

  it('resolves emoji layout to pixels (size vs shorter edge)', () => {
    const o = { ...defaultEmojiOverlay('✨'), x: 0.5, y: 0.25, size: 0.2 };
    const l = resolveEmojiLayout(o, { width: 2000, height: 1000 });
    expect(l.px).toBeCloseTo(200, 5); // 0.2 * 1000
    expect(l.x).toBeCloseTo(1000, 5);
    expect(l.y).toBeCloseTo(250, 5);
  });

  it('updateOverlay can patch an emoji without touching kind', () => {
    let s = addOverlay(state(), defaultEmojiOverlay('✨'));
    const id = s.overlays[0]!.id;
    s = updateOverlay(s, id, { size: 0.3, rotationDeg: 45 });
    const o = s.overlays[0];
    expect(o?.kind).toBe('emoji');
    expect(o?.kind === 'emoji' && o.size).toBe(0.3);
    expect(o?.kind === 'emoji' && o.rotationDeg).toBe(45);
  });
});

describe('frame overlays', () => {
  it('border geometry insets a stroked rect from the edge', () => {
    const o = { ...defaultFrameOverlay(), style: 'border' as const, thickness: 0.02, inset: 0.03 };
    const g = resolveFrameGeometry(o, { width: 1000, height: 1000 });
    expect(g.style).toBe('border');
    expect(g.thicknessPx).toBeCloseTo(20, 5); // 0.02 * 1000
    // inset(30) + thickness/2(10) = 40 from each edge.
    expect(g.rx).toBeCloseTo(40, 5);
    expect(g.rw).toBeCloseTo(1000 - 80, 5);
  });

  it('matte geometry leaves a centered inner hole', () => {
    const o = { ...defaultFrameOverlay(), style: 'matte' as const, thickness: 0.05 };
    const g = resolveFrameGeometry(o, { width: 1000, height: 800 });
    // shorter edge 800 → t = 40.
    expect(g.thicknessPx).toBeCloseTo(40, 5);
    expect(g.rx).toBeCloseTo(40, 5);
    expect(g.rw).toBeCloseTo(1000 - 80, 5);
    expect(g.rh).toBeCloseTo(800 - 80, 5);
  });

  it('clamps inner size to non-negative for a huge thickness', () => {
    const o = { ...defaultFrameOverlay(), style: 'matte' as const, thickness: 5 };
    const g = resolveFrameGeometry(o, { width: 100, height: 100 });
    expect(g.rw).toBeGreaterThanOrEqual(0);
    expect(g.rh).toBeGreaterThanOrEqual(0);
  });
});
