import { describe, expect, it } from 'vitest';
import { computeTextPosition } from './text-layout';

const canvas = { width: 400, height: 200 };

describe('computeTextPosition', () => {
  it('top-left sits at the margin', () => {
    const p = computeTextPosition('top-left', canvas, 100, 20, 10);
    expect(p.x).toBe(10);
    expect(p.y).toBe(30); // margin + fontPx
  });

  it('top-right accounts for text width', () => {
    const p = computeTextPosition('top-right', canvas, 100, 20, 10);
    expect(p.x).toBe(400 - 100 - 10);
  });

  it('bottom-left sits near the bottom margin', () => {
    const p = computeTextPosition('bottom-left', canvas, 100, 20, 10);
    expect(p.x).toBe(10);
    expect(p.y).toBe(200 - 10);
  });

  it('middle-center is horizontally and vertically centered', () => {
    const p = computeTextPosition('middle-center', canvas, 100, 20, 10);
    expect(p.x).toBe((400 - 100) / 2);
    expect(p.y).toBe(200 / 2 + 10);
  });

  it('all 9 anchors stay within the canvas for reasonable text sizes', () => {
    const anchors: Parameters<typeof computeTextPosition>[0][] = [
      'top-left',
      'top-center',
      'top-right',
      'middle-left',
      'middle-center',
      'middle-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ];
    for (const a of anchors) {
      const p = computeTextPosition(a, canvas, 80, 16, 8);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(canvas.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(canvas.height);
    }
  });
});
