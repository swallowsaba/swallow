import { describe, expect, it } from 'vitest';
import { NAME_PARTS, POLITICS_RULES } from '@/content/politics';
import { terrainOf } from './runner';
import { applyOp } from './commands';
import { APPEAL_BORDER } from './appeal';
import { ORGANIZATION } from './opposition';
import { START_CAPITAL, newWorld } from './world';
import { canChooseStart, START_MODES } from './startMode';

/**
 * 始め方（docs/game-design.md 27 章・docs/testing-strategy.md 10 章「褒賞・始め方」）:
 * 始め方ごとの組織化の係数・申し立ての境・初めの政治資本。新しく始めた都市でだけ選べる
 */

const T = terrainOf(20261002);
const fresh = newWorld(T, NAME_PARTS);

describe('始め方の 3 つ（27 章の表）', () => {
  it('係数・境・初めの政治資本は表のとおり。並びは穏やか → ふつう → 手ごわい', () => {
    expect(START_MODES.map((m) => [m.id, m.name, ORGANIZATION[m.id], APPEAL_BORDER[m.id], START_CAPITAL[m.id]])).toEqual([
      ['gentle', '穏やかな町', 0.8, 45, 14],
      ['normal', 'ふつう', 1, 35, 10],
      ['tough', '手ごわい町', 1.25, 25, 7],
    ]);
  });

  it('新しい都市は「ふつう」で始まり、政治資本 10', () => {
    expect([fresh.politics.difficulty, fresh.politics.capital]).toEqual(['normal', 10]);
  });
});

describe('始め方を選ぶ命令', () => {
  it('新しく始めた都市で選ぶと、始め方と初めの政治資本が変わる。初めの人口・区画・施設・資金は変わらない', () => {
    const tough = applyOp(fresh, { kind: 'startMode', difficulty: 'tough' }, T, POLITICS_RULES);
    expect([tough.politics.difficulty, tough.politics.capital]).toEqual(['tough', 7]);
    expect(tough.city).toBe(fresh.city);
    expect(tough.budget).toBe(fresh.budget);
    const gentle = applyOp(tough, { kind: 'startMode', difficulty: 'gentle' }, T, POLITICS_RULES);
    expect([gentle.politics.difficulty, gentle.politics.capital]).toEqual(['gentle', 14]);
  });

  it('申請を出した後や、政治資本を動かした後は選べない（始めた後に手ごわさを変えない）', () => {
    expect(canChooseStart(fresh)).toBe(true);
    const used = { ...fresh, politics: { ...fresh.politics, capital: 13, capitalLog: [{ day: 3, amount: 3, why: 'ミッション' }] } };
    expect(canChooseStart(used)).toBe(false);
    expect(applyOp(used, { kind: 'startMode', difficulty: 'tough' }, T, POLITICS_RULES).politics).toBe(used.politics);
    const filed = { ...fresh, applications: [{ id: 'a1' } as (typeof fresh.applications)[number]] };
    expect(canChooseStart(filed)).toBe(false);
    const second = { ...fresh, politics: { ...fresh.politics, term: { ...fresh.politics.term, no: 2 } } };
    expect(canChooseStart(second)).toBe(false);
  });
});
