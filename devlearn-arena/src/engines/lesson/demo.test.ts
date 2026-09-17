import { describe, expect, it } from 'vitest';
import { CITIES, CITY_TRACKS } from '@/content/city';
import { demoFrames } from './demo';

describe('動きを見る', () => {
  it('打つ前の状態から、模範解答を 1 コマンドずつ打った状態が並ぶ', () => {
    const frames = demoFrames('git/01');
    expect(frames[0]?.command).toBeNull();
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.slice(1).every((f) => typeof f.command === 'string' && f.command !== '')).toBe(true);
    // 状態が実際に変わっている
    expect(frames[frames.length - 1]?.state).not.toBe(frames[0]?.state);
  });

  it('何度作っても同じ列になる', () => {
    expect(demoFrames('k8s/01').map((f) => [f.command, f.output])).toEqual(demoFrames('k8s/01').map((f) => [f.command, f.output]));
  });

  it('どの街の最初の施設でも、動きを見せられる', () => {
    for (const track of CITY_TRACKS) {
      const first = CITIES[track].facilities[0];
      expect(demoFrames(first?.id ?? '').length, track).toBeGreaterThan(1);
    }
  });

  it('無い施設なら空', () => {
    expect(demoFrames('nope/99')).toEqual([]);
  });
});
