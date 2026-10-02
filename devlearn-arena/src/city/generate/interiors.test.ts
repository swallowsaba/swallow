import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '../facilities';
import { INTERIOR_FACILITIES, interiorModel } from './interiors';
import { meshModel } from './mesh';
import { singleViewSvg } from './svg';

/**
 * 施設の中の景色（レッスン画面の背景。docs/visual-design.md 6.1: src/screens/lesson/backdrops/<施設>.svg、15 枚）。
 */

const DIR = join(__dirname, '../../screens/lesson/backdrops');
const read = (type: string): string => readFileSync(join(DIR, `${type}.svg`), 'utf8').replace(/\r\n/g, '\n');

describe('施設の中の景色', () => {
  it('15 の施設（公園の類と記念碑を除く）に 1 枚ずつあり、ほかの物は置かない', () => {
    const facilities = Object.values(FACILITY_DEFS).filter((d) => d.group === 'facility').map((d) => d.type).sort();
    expect(facilities).toHaveLength(15);
    expect([...INTERIOR_FACILITIES].sort()).toEqual(facilities);
    expect(readdirSync(DIR).filter((f) => f.endsWith('.svg')).sort()).toEqual(facilities.map((t) => `${t}.svg`));
  });

  it('30KB 以内で、viewBox と自作の注記と作成日を持ち、外部の画像を埋め込まない', () => {
    for (const type of INTERIOR_FACILITIES) {
      const svg = read(type);
      expect(svg.length, type).toBeLessThanOrEqual(30 * 1024);
      expect(svg).toMatch(/viewBox="-?\d+ -?\d+ \d+ \d+"/);
      expect(svg).toMatch(/自作（本プロジェクト）。作成日 \d{4}-\d{2}-\d{2}/);
      expect(svg).not.toMatch(/<image|href=|base64/);
    }
  });

  it('模型から作り直した物と一致する（手で書き換えていない）', () => {
    for (const type of INTERIOR_FACILITIES) {
      const svg = read(type);
      const model = interiorModel(type);
      if (!model) throw new Error(type);
      const created = /作成日 (\d{4}-\d{2}-\d{2})/.exec(svg)?.[1] ?? '';
      expect(svg, type).toBe(singleViewSvg(meshModel(model, 0), `${FACILITY_DEFS[type].name}の中`, created, 'src/city/generate/interiors.ts'));
    }
  });

  it('部屋は床と奥の 2 面の壁と、設備・家具（壁の物を除いて 4 つ以上）を持つ', () => {
    for (const type of INTERIOR_FACILITIES) {
      const model = interiorModel(type);
      if (!model) throw new Error(type);
      // 壁 2 面と角の柱の後に、設備・家具の部品が並ぶ
      expect(model.parts.length - 3, type).toBeGreaterThanOrEqual(4);
      expect(model.ground?.length ?? 0, type).toBeGreaterThan(40);
    }
  });
});
