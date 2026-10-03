import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS, LANDMARKS } from '@/city/facilities';
import { upgradeCost } from '@/city/rules';
import type { FacilityType } from '@/city/types';
import { domainDef, ENTRIES } from './catalog';
import { ERROR_GUIDES, TERMS } from './glossary';
import { MISSIONS, parseMissions } from './missions';
import type { Mission } from './schema';
import { validateMission, type MissionContext } from './validate';

/** docs/game-design.md 8 章のミッション 6 本と、docs/content-spec.md 4・6 章の形と規則 */

const ctx: MissionContext = {
  catalog: new Map(ENTRIES.map((e) => [e.id, e])),
  terms: new Map(TERMS.map((t) => [t.id, t])),
  errors: new Set(ERROR_GUIDES.map((e) => e.id)),
  guides: ERROR_GUIDES,
  landmarks: new Set(LANDMARKS.map((l) => l.id)),
};

function baseMission(): Mission {
  const m = MISSIONS.find((x) => x.id === 'web-server');
  if (!m) throw new Error('web-server が無い');
  return m;
}

describe('ミッション（content/missions）', () => {
  it('docs/game-design.md 8 章の 6 本がそろい、関係する分野も表の通り', () => {
    expect(MISSIONS.map((m) => [m.title, [...m.domains].sort()]).sort()).toEqual([
      ['Git で変更を管理せよ', ['git']],
      ['HTTPS を有効にせよ', ['sec', 'web']],
      ['Kubernetes 上でアプリを動かせ', ['ctr', 'k8s']],
      ['Web サーバを構築せよ', ['linux', 'net', 'web']],
      ['コンテナを起動せよ', ['ctr', 'docker']],
      ['障害原因を特定せよ', ['linux', 'trouble', 'web']],
    ].sort());
  });

  it('全てが規則を満たす（おすすめのレッスン・用語・想定エラー・最後のヒントで通る・報酬の XP・記念碑）', () => {
    expect(MISSIONS.map((m) => [m.id, validateMission(m, ctx)])).toEqual(MISSIONS.map((m) => [m.id, []]));
  });

  it('必要な知識を 1 つ以上示す（docs/decisions.md D-15）', () => {
    for (const m of MISSIONS) expect(m.knowledge.length).toBeGreaterThan(0);
  });

  it('報酬の開発資金は、先頭の分野の施設を Lv2 に上げる 1 回分（docs/game-design.md 8 章）', () => {
    for (const m of MISSIONS) {
      const main = m.domains[0];
      const facility = (main ? domainDef(main)?.facility : undefined) as FacilityType | undefined;
      expect([m.id, m.rewards.funds]).toEqual([m.id, facility ? upgradeCost(FACILITY_DEFS[facility].cost, 2) : -1]);
    }
  });

  it('記念碑は 1 本に 1 つで、重ならない', () => {
    const landmarks = MISSIONS.map((m) => m.rewards.landmark);
    expect(landmarks.every((l) => l !== undefined)).toBe(true);
    expect(new Set(landmarks).size).toBe(MISSIONS.length);
  });

  it('並びは報酬の XP の小さい順（取り組みやすい順）', () => {
    const xp = MISSIONS.map((m) => m.rewards.xp);
    expect(xp).toEqual([...xp].sort((a, b) => a - b));
  });
});

describe('ミッションの検証が誤りを見つける', () => {
  const base = baseMission();
  const broken = (edit: (m: Mission) => void): string[] => {
    const m = structuredClone(base);
    edit(m);
    return validateMission(m, ctx);
  };

  it('おすすめのレッスンが目録に無い・記念碑が無い・XP が範囲の外', () => {
    expect(broken((m) => { m.recommended = ['linux.b.99']; })).toContain('おすすめのレッスン linux.b.99 が目録に無い');
    expect(broken((m) => { m.rewards.landmark = 'statue'; })).toContain('記念碑 statue が無い（content/facilities.json の landmarks）');
    expect(broken((m) => { m.rewards.xp = 1000; })).toContain('報酬の XP 1000 が 100〜400 の外');
  });

  it('用語集の語を初めて出る所で印を付けずに書いた・用語集に無い用語', () => {
    expect(broken((m) => { m.story = 'ポートを開けよう。'; }).some((p) => p.includes('「ポート」が初めて出る所に印'))).toBe(true);
    expect(broken((m) => { m.knowledge = ['{{term:no-such-term}} を知る。']; })).toContain('用語集に無い用語 no-such-term');
  });

  it('最後のヒントで通らない実戦', () => {
    const p = broken((m) => {
      const step = m.practice.steps[0];
      if (step) step.hints = [step.hints[0], step.hints[1], '`systemctl status nginx` と打つ。'];
    });
    expect(p.some((x) => x.includes('最後のヒントを打っても達成条件を満たさない'))).toBe(true);
  });

  it('ID の違うファイルは読み込みで落ちる', () => {
    expect(() => parseMissions([['../../content/missions/other.json', base]])).toThrow(/ファイル名と違う/);
  });
});
