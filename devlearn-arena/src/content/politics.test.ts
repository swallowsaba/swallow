import { describe, expect, it } from 'vitest';
import { ENTRIES } from './catalog';
import { TERMS } from './glossary';
import { lowersMeasure, objectionTargets, POLITICS_RULES, REASONS, validateReasons } from './politics';
import type { ObjectionReason } from '@/sim/types';

/**
 * 市政のデータの検証（docs/content-spec.md 6 章の市政の項目）。
 * 反対の理由と譲歩（G4）。説明と技術の代案の揃い方は G7 で足す。
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
