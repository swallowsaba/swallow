/**
 * 施設の SVG を、模型（src/city/generate/facilityModels.ts）から作り直す。
 *   npx vite-node tools/build-facility-svgs.mts
 * 作った SVG は src/city/assets/facilities/<施設>/lv<N>.svg に置く（docs/visual-design.md 6.1）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { FACILITY_DEFS } from '../src/city/facilities';
import { facilityModel, MODELED_FACILITIES } from '../src/city/generate/facilityModels';
import { meshModel } from '../src/city/generate/mesh';
import { drawingToSvg } from '../src/city/generate/svg';

const created = process.env.SVG_CREATED ?? '2026-10-02';
for (const type of MODELED_FACILITIES) {
  for (const level of [1]) {
    const model = facilityModel(type, level);
    if (!model) continue;
    const svg = drawingToSvg(meshModel(model, 0), meshModel(model, 2), `${FACILITY_DEFS[type].name} Lv${String(level)}`, created);
    const dir = `src/city/assets/facilities/${type}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/lv${String(level)}.svg`, svg);
    console.log(`${dir}/lv${String(level)}.svg ${String(Math.round(svg.length / 102.4) / 10)}KB`);
  }
}
