import { describe, expect, it } from 'vitest';
import { clip, drop, textWidth } from './sceneKit';

describe('図の部品を置く道具', () => {
  it('全角は半角より広く数える', () => {
    expect(textWidth('あ')).toBeGreaterThan(textWidth('a'));
  });

  it('長い文字は幅に収まるよう … で切る', () => {
    const out = clip('very-long-file-name.txt', 60);
    expect(out.endsWith('…')).toBe(true);
    expect(textWidth(out)).toBeLessThanOrEqual(60);
    expect(clip('a.txt', 60)).toBe('a.txt');
  });

  it('上から下へ垂れる線は、始点から終点まで引く', () => {
    expect(drop({ x: 0, y: 0 }, { x: 10, y: 20 })).toBe('M 0 0 C 0 10, 10 10, 10 20');
  });
});
