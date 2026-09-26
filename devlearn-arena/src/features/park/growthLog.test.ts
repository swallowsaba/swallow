import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { causeOf, GROWTH_LOG_SIZE, growthSpot, logGrowth, type GrowthMark } from './growthLog';

/** 街が育った場所と、育ちの記録（REWORK 2-1・2-2） */

describe('育った場所', () => {
  it('家が増えたら、いちばん新しい家の所で「＋家 1」', () => {
    const city = buildCity({ unlocked: ['center'], growth: { houses: 2, floors: 0 } });
    expect(growthSpot(city, { houses: 1, floors: 0 }, { houses: 2, floors: 0 })).toEqual({
      building: 'home:2',
      label: '住民の家 2',
      gain: '＋家 1',
    });
  });

  it('階だけが増えたら、最後の 1 階が載った建物の所で「＋1 階」', () => {
    const before = buildCity({ unlocked: ['center'], growth: { houses: 3, floors: 4 } });
    const after = buildCity({ unlocked: ['center'], growth: { houses: 3, floors: 5 } });
    const spot = growthSpot(after, { houses: 3, floors: 4 }, { houses: 3, floors: 5 });
    expect(spot?.gain).toBe('＋1 階');
    // 記録した建物は、実際に 1 階高くなった建物である
    const floorsOf = (city: typeof after, id: string) => city.buildings.find((b) => b.id === id)?.bonusFloors ?? 0;
    expect(floorsOf(after, spot?.building ?? '')).toBe(floorsOf(before, spot?.building ?? '') + 1);
  });

  it('クリアで家も階も増えたら、両方を札に出し、新しい家へ寄る', () => {
    const city = buildCity({ unlocked: ['center'], growth: { houses: 1, floors: 2 } });
    expect(growthSpot(city, { houses: 0, floors: 0 }, { houses: 1, floors: 2 })).toEqual({
      building: 'home:1',
      label: '住民の家 1',
      gain: '＋家 1 ・ ＋2 階',
    });
  });

  it('何も増えていなければ null', () => {
    const city = buildCity({ unlocked: ['center'], growth: { houses: 1, floors: 1 } });
    expect(growthSpot(city, { houses: 1, floors: 1 }, { houses: 1, floors: 1 })).toBeNull();
  });

  it('階が載る建物がまだ無い街では null（何も無い所へ寄らない）', () => {
    const city = buildCity({ unlocked: ['center'], growth: { houses: 0, floors: 1 } });
    expect(growthSpot(city, { houses: 0, floors: 0 }, { houses: 0, floors: 1 })).toBeNull();
  });
});

describe('何をしたら育ったか', () => {
  it('コマンドは打った行をそのまま出す', () => {
    expect(causeOf('command', 'kubectl get nodes')).toBe('kubectl get nodes を打った');
  });

  it('どのきっかけにも言葉がある', () => {
    for (const trigger of ['command', 'step', 'quiz', 'clear'] as const) {
      expect(causeOf(trigger, 'ls').length).toBeGreaterThan(0);
    }
  });
});

describe('成長の記録', () => {
  const mark = (key: number): GrowthMark => ({ key, cause: 'ls を打った', gain: '＋1 階', building: 'home:1', label: '住民の家 1' });

  it('新しいものが先頭に来る', () => {
    const log = logGrowth(logGrowth([], mark(1)), mark(2));
    expect(log.map((m) => m.key)).toEqual([2, 1]);
  });

  it('決まった件数より古いものは消える', () => {
    let log: GrowthMark[] = [];
    for (let i = 0; i < GROWTH_LOG_SIZE + 3; i += 1) log = logGrowth(log, mark(i));
    expect(log).toHaveLength(GROWTH_LOG_SIZE);
    expect(log[0]?.key).toBe(GROWTH_LOG_SIZE + 2);
  });
});
