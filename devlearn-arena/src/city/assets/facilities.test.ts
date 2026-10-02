import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from '../facilities';
import { facilityModel, MODELED_FACILITIES } from '../generate/facilityModels';
import { meshModel } from '../generate/mesh';
import { drawingToSvg, svgView, viewForRotation } from '../generate/svg';

/**
 * 施設の SVG（docs/visual-design.md 5 章・6.1、docs/asset-policy.md 2 章）。
 */

const DIR = join(__dirname, 'facilities');
const files = readdirSync(DIR).flatMap((type) => readdirSync(join(DIR, type)).map((f) => ({ type, file: join(DIR, type, f), name: f })));

describe('施設の SVG', () => {
  it('全ての施設と公園の類（ミッションの報酬の記念碑を除く）の Lv1 がある', () => {
    const types = Object.values(FACILITY_DEFS).filter((d) => d.group !== 'reward').map((d) => d.type);
    expect(types).toHaveLength(19);
    for (const type of types) {
      expect(files.some((f) => f.type === type && f.name === 'lv1.svg'), type).toBe(true);
    }
  });

  it('ファイル名は lv<1-5>.svg、置き場所は施設の種類の名前', () => {
    for (const f of files) {
      expect(f.name).toMatch(/^lv[1-5]\.svg$/);
      expect(Object.keys(FACILITY_DEFS)).toContain(f.type);
    }
  });

  it('30KB 以内で、viewBox と自作の注記と作成日を持つ', () => {
    for (const f of files) {
      const svg = readFileSync(f.file, 'utf8');
      expect(svg.length, f.file).toBeLessThanOrEqual(30 * 1024);
      expect(svg).toMatch(/viewBox="-?\d+ -?\d+ \d+ \d+"/);
      expect(svg).toMatch(/自作（本プロジェクト）。作成日 \d{4}-\d{2}-\d{2}/);
    }
  });

  it('外部の画像を埋め込まない', () => {
    for (const f of files) expect(readFileSync(f.file, 'utf8')).not.toMatch(/<image|href=|base64/);
  });

  it('模型から作り直した物と一致する（手で書き換えていない）', () => {
    for (const type of MODELED_FACILITIES) {
      const model = facilityModel(type, 1);
      if (!model) continue;
      const svg = readFileSync(join(DIR, type, 'lv1.svg'), 'utf8');
      const created = /作成日 (\d{4}-\d{2}-\d{2})/.exec(svg)?.[1] ?? '';
      const again = drawingToSvg(meshModel(model, 0), meshModel(model, 2), `${FACILITY_DEFS[type].name} Lv1`, created);
      expect(svg.replace(/\r\n/g, '\n')).toBe(again);
    }
  });

  it('正面と裏の姿を取り出せ、4 つの向きで入口が回転の通りの側に来る', () => {
    const svg = readFileSync(join(DIR, 'academy', 'lv1.svg'), 'utf8');
    expect(svgView(svg, 'front').svg).toContain('<path');
    expect(svgView(svg, 'back').svg).toContain('<path');
    // 入口の向き（見る向きの座標）: 正面の姿は +y、裏の姿は −y。映すと x と y が入れ替わる
    const front = { front: '+y', back: '-y' } as const;
    const mirror = { '+y': '+x', '-y': '-x' } as const;
    const expected = ['+y', '-x', '-y', '+x'];
    for (const r of [0, 1, 2, 3] as const) {
      const { view, mirrored } = viewForRotation(r);
      const side = front[view];
      expect(mirrored ? mirror[side] : side).toBe(expected[r]);
    }
  });
});
