import { describe, expect, it } from 'vitest';
import { displayOf } from './display';

describe('都市の描き方の設定', () => {
  it('表示品質を低くすると、画素を細かくせず、車と人を描かない（重い時に軽くする）', () => {
    expect(displayOf({ quality: 'low', reduceMotion: false })).toMatchObject({ pixelRatioCap: 1, agents: false });
    expect(displayOf({ quality: 'standard', reduceMotion: false })).toMatchObject({ pixelRatioCap: 1.5, agents: true });
    expect(displayOf({ quality: 'high', reduceMotion: false })).toMatchObject({ pixelRatioCap: 2, agents: true });
  });

  it('動きを減らすと、車と人は止まり、光の輪は広がらない。描く物は減らさない', () => {
    const full = displayOf({ quality: 'standard', reduceMotion: false });
    const reduced = displayOf({ quality: 'standard', reduceMotion: true });
    expect(full).toMatchObject({ agentsMove: true, ringsMove: true });
    expect(reduced).toMatchObject({ agentsMove: false, ringsMove: false, agents: true, pixelRatioCap: full.pixelRatioCap });
  });
});
