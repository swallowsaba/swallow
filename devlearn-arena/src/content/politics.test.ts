import { describe, expect, it } from 'vitest';
import { ENTRIES } from './catalog';
import { TERMS } from './glossary';
import { COUNCIL, DOMAIN_LINKS, EXPLAIN, lowersMeasure, MEMBER_KEYS, objectionTargets, POLITICS_RULES, REASONS, validateCouncil, validateLearning, validateReasons } from './politics';
import type { ObjectionReason } from '@/sim/types';

/**
 * 市政のデータの検証（docs/content-spec.md 6 章の市政の項目）。
 * 反対の理由と譲歩（G4）。説明と技術の代案の揃い方（G7）。
 */

const ctx = { lessons: new Set(ENTRIES.map((e) => e.id)), terms: new Set(TERMS.map((t) => t.id)) };

describe('反対の理由のデータ（content/politics/objections/。7.1）', () => {
  it('全ての理由が検証を通る（2 つ以上・requires の無い譲歩が強さの元を下げる・レッスンと用語がある）', () => {
    expect(validateReasons(REASONS, ctx)).toEqual([]);
  });

  it('今ある全ての申請の種類（IT 施設 15・そのアップグレード・用途地域の変更 4）に、理由が 2 つ以上ある', () => {
    expect(objectionTargets()).toHaveLength(15 * 2 + 4);
    for (const t of objectionTargets()) expect(REASONS.filter((r) => r.targets.includes(t)).length, t).toBeGreaterThanOrEqual(2);
  });

  it('データセンターには、夜間の騒音・電力の逼迫・雇用が少ない・冷却水の使用が立つ（docs/development-plan.md G4 の完成条件）', () => {
    const titles = REASONS.filter((r) => r.targets.includes('datacenter')).map((r) => r.title);
    expect(titles).toEqual(['夜間の騒音', '電力の逼迫', '雇用が少ない', '冷却水の使用']);
  });

  it('同じ文言の言い分を使い回さない', () => {
    const claims = REASONS.map((r) => r.claim);
    expect(new Set(claims).size).toBe(claims.length);
    // 説明の文と、住民と議員の受け取り方の 1 行も
    for (const key of ['text', 'why'] as const) {
      const lines = REASONS.flatMap((r) => r.explanations.map((e) => e[key]));
      expect(new Set(lines).size, key).toBe(lines.length);
    }
  });

  it('検証は誤りを見つける: requires の無い譲歩が無い・譲歩が元の値を下げない・理由が 1 つだけの種類', () => {
    const base = REASONS.find((r) => r.id === 'dc-night-noise') as ObjectionReason;
    const onlyTech: ObjectionReason = { ...base, id: 'x-1', concessions: [{ id: 'x-c', label: '液冷', mods: { noise: 0.2 }, requires: { domain: 'db', stage: 4 } }] };
    const notLower: ObjectionReason = { ...base, id: 'x-2', concessions: [{ id: 'x-d', label: '雇う', mods: { jobs: 1.5 } }] };
    const problems = validateReasons([...REASONS, onlyTech, notLower], ctx);
    expect(problems).toContain('x-1: requires の無い譲歩が無い（スキルが無くても通せる道が要る）');
    expect(problems).toContain('x-2: requires の無い譲歩のどれも、強さの元の値（noise）を下げない');
    expect(validateReasons(REASONS.filter((r) => r.id !== 'server-jobs'), ctx)).toContain('server: 反対の理由が 1 つ（2 つ以上要る）');
  });

  it('学ぶと答えが増える（G7）: IT 施設の理由は、施設か関連の分野の sound の説明を段階 1〜2 と 3 に持ち、技術の代案（段階 4 以上）を持つ', () => {
    const base = REASONS.find((r) => r.id === 'dc-night-noise') as ObjectionReason;
    const sound = base.explanations.filter((e) => e.quality === 'sound');
    const noBasic: ObjectionReason = { ...base, id: 'y-1', explanations: sound.filter((e) => e.stage === 3) };
    const noNumbers: ObjectionReason = { ...base, id: 'y-2', explanations: sound.filter((e) => e.stage <= 2) };
    const noTech: ObjectionReason = { ...base, id: 'y-3', concessions: base.concessions.filter((c) => !c.requires) };
    const farDomain: ObjectionReason = { ...base, id: 'y-4', explanations: [...base.explanations, { id: 'y-git', domain: 'git', stage: 1, quality: 'sound', text: 'x', why: 'x' }] };
    const farTech: ObjectionReason = { ...base, id: 'y-5', concessions: [...base.concessions, { id: 'y-tech', label: 'x', mods: { noise: 0.5 }, requires: { domain: 'git', stage: 4 } }] };
    const problems = validateLearning([noBasic, noNumbers, noTech, farDomain, farTech]);
    expect(problems).toEqual([
      'y-1: 段階 1〜2 の sound の説明が無い',
      'y-2: 段階 3 の sound の説明が無い',
      'y-3: 技術の代案（requires の段階 4 以上の譲歩）が無い',
      'y-4: 説明 y-git の分野 git が施設の分野にも関連の分野にも無い',
      'y-5: 技術の代案 y-tech の分野 git が施設の分野にも関連の分野にも無い',
    ]);
    // 用途地域の変更（IT 施設でない）の理由には求めない
    expect(validateLearning(REASONS.filter((r) => r.targets.some((t) => t.startsWith('rezone:'))))).toEqual([]);
    // 関連の分野は docs/curriculum.md 3.2 の推奨前提と関連（データセンター = db に、cloud・web・trouble）
    expect(DOMAIN_LINKS.db).toEqual(['web', 'cloud', 'trouble']);
  });

  it('強さの元の値を下げる譲歩の対応（7.1.1）: 騒音は noise・nightNoise・height、費用は費用を下げて規模も小さくする', () => {
    expect(lowersMeasure({ kind: 'noise', night: true }, { mods: { nightNoise: 0 } })).toBe(true);
    expect(lowersMeasure({ kind: 'noise' }, { mods: { tech: 0.8 } })).toBe(false);
    expect(lowersMeasure({ kind: 'jobs-density' }, { mods: { jobs: 1.5 } })).toBe(true);
    expect(lowersMeasure({ kind: 'cost' }, { mods: { height: -1 }, cost: { ratio: -0.2 } })).toBe(true);
    expect(lowersMeasure({ kind: 'cost' }, { mods: {}, cost: { ratio: -0.2 } })).toBe(false);
  });

  it('模擬に渡す施設の電力（24.1）: IT 施設は Lv あたり 0.5 MW、データセンター・クラスタ施設・クラウドセンターは 3 MW。冷却水はデータセンターだけ 0.15', () => {
    expect(POLITICS_RULES.facilities.server).toEqual({ powerMW: 0.5 });
    for (const t of ['datacenter', 'cluster', 'cloud'] as const) expect(POLITICS_RULES.facilities[t]?.powerMW).toBe(3);
    expect(POLITICS_RULES.facilities.datacenter?.traits).toEqual({ coolingWater: 0.15 });
    expect(POLITICS_RULES.facilities.park).toBeUndefined();
  });
});

describe('議員のデータ（content/politics/council.json。7.2）', () => {
  it('ちょうど 7 人。7 つの論点のそれぞれが、ちょうど 1 人の主な論点。口ぶりの文を使い回さない', () => {
    expect(validateCouncil(COUNCIL)).toEqual([]);
    expect(POLITICS_RULES.council).toBe(COUNCIL);
  });

  it('7 人が同じ顔に見えない: 名前・人柄・人の影・姿勢が違い、どの議員も 9 種の 1 行を自分の口ぶりで持つ', () => {
    for (const key of ['name', 'profile', 'icon'] as const) expect(new Set(COUNCIL.map((m) => m[key])).size, key).toBe(7);
    expect(new Set(COUNCIL.map((m) => m.stance)).size).toBeGreaterThanOrEqual(4);
    for (const m of COUNCIL) expect(Object.keys(m.lines ?? {}).sort(), m.id).toEqual([...MEMBER_KEYS].sort());
    // 共通の型の文とも同じにしない
    const defaults = new Set(Object.values(EXPLAIN.member));
    for (const m of COUNCIL) for (const line of Object.values(m.lines ?? {})) expect(defaults.has(line), line).toBe(false);
  });

  it('検証は誤りを見つける: 6 人・主な論点の重なり・同じ文・知らない差し込み名', () => {
    const [a, b] = COUNCIL as [typeof COUNCIL[number], typeof COUNCIL[number]];
    expect(validateCouncil(COUNCIL.slice(1))).toContain('議員が 6 人（ちょうど 7 人）');
    const twice = COUNCIL.map((m) => (m.id === b.id ? { ...m, main: a.main } : m));
    expect(validateCouncil(twice)).toContain(`論点 ${a.main} を主に見る議員が 2 人（ちょうど 1 人）`);
    const copied = COUNCIL.map((m) => (m.id === b.id ? { ...m, lines: { ...m.lines, gain: a.lines?.gain ?? '' } } : m));
    expect(validateCouncil(copied)).toContain(`${b.id}: gain の文が ${a.id} と同じ`);
    const unknown = COUNCIL.map((m) => (m.id === a.id ? { ...m, lines: { ...m.lines, stance: '{name}は{dir}' } } : m));
    expect(validateCouncil(unknown)).toContain(`${a.id}: stance に知らない差し込み名 {name}`);
  });
});
