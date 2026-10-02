/**
 * 施設と、車・人の SVG を、模型（src/city/generate/facilityModels.ts・agents.ts）から作り直す。
 *   npx vite-node tools/build-facility-svgs.mts
 * 作った SVG は src/city/assets/facilities/<施設>/lv<N>.svg に置く（docs/visual-design.md 6.1）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { FACILITY_DEFS } from '../src/city/facilities';
import { CAR_COLORS, carModel, PERSON_COLORS, personModel } from '../src/city/generate/agents';
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

// 車 5 色・人 4 種（docs/visual-design.md 6.1）
const agents = 'src/city/assets/agents';
mkdirSync(agents, { recursive: true });
const write = (file: string, svg: string): void => {
  writeFileSync(`${agents}/${file}`, svg);
  console.log(`${agents}/${file} ${String(Math.round(svg.length / 102.4) / 10)}KB`);
};
CAR_COLORS.forEach((_, i) => {
  const model = carModel(i);
  write(`car-${String(i + 1)}.svg`, drawingToSvg(meshModel(model, 0), meshModel(model, 2), `車 ${String(i + 1)}`, created, 'src/city/generate/agents.ts'));
});
PERSON_COLORS.forEach((_, i) => {
  const model = personModel(i);
  write(`person-${String(i + 1)}.svg`, drawingToSvg(meshModel(model, 0), meshModel(model, 2), `人 ${String(i + 1)}`, created, 'src/city/generate/agents.ts'));
});
